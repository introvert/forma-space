"use strict"

var express = require('express');
var sqlite3 = require('sqlite3').verbose();

var app = express();

// var request = require('request');
const request = require("request-promise");

var http = require('http').Server(app);
var socketio = require('socket.io')(http);

var port = process.env.port || 3000;

var db = new sqlite3.Database('./state.db');

function initializeDatabase() {
  db.serialize(function() {
    db.run("CREATE TABLE IF NOT EXISTS state (started TEXT, length TEXT, track TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS chats (time TEXT, userName TEXT, message TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS history (type TEXT, item TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS queue (queue TEXT, time TEXT)");
  });
}

// Functions that store the state, chat, history and queue in the database
function storeState(state) {
  db.run("INSERT INTO state (started, length, track) VALUES (?, ?, ?)", [state.started, state.length, JSON.stringify(state.track)]);
}

function storeChat(chat) {
  db.run("INSERT INTO chats (time, userName, message) VALUES (?, ?, ?)", [chat.time, chat.userName, chat.message]);
}

function storeHistory(type, item) {
  db.run("INSERT INTO history (type, item) VALUES (?, ?)", [type, JSON.stringify(item)]);
}

function storeQueue(queue) {
  db.run("INSERT INTO queue (queue, time) VALUES (?, ?)", [JSON.stringify(queue), Date.now()]);
}

// Functions that recover the state, chat, history and queue from the database
function recoverState(callback) {
  db.get("SELECT * FROM state ORDER BY rowid DESC LIMIT 1", [], (err, row) => {
    console.log("recoverState row", row);
    if (row) {
      callback({
        started: row.started,
        length: row.length,
        track: JSON.parse(row.track)
      });
    } else {
      callback(null);  // Call the callback with null when there's no state to recover
    }
  });
}

function recoverChats(callback) {
  db.each("SELECT * FROM chats", [], (err, row) => {
    if (row) {
      callback({
        time: row.time,
        userName: row.userName,
        message: row.message
      });
    }
  });
}

function recoverHistory(callback) {
  db.each("SELECT * FROM history", [], (err, row) => {
    if (row) {
      callback(row.type, JSON.parse(row.item));
    }
  });
}

function recoverQueue(callback) {
  // find the most recent queue
  db.get("SELECT * FROM queue ORDER BY time DESC LIMIT 1", [], (err, row) => {
    if (row) {
      callback(JSON.parse(row.queue));
    } else {
      callback([]);
    }
  });
}

app.use(express.static(__dirname + "/../client"));
app.use(express.static(__dirname + "/../node_modules"));

// used for forwarding on the local devs
app.get('/fwd', function(req, res) {
  //modify the url in any way you want
  const url = req.query.url;
  const headers = {
    'Referer': 'https://formaviva.com'
  };
  // var newurl = 'http://google.com/';
  request({ url, headers }).pipe(res);
});

var users = [];
var queue = [];
var logs = [];

var currentState = {
  started: null,
  length: null,
  track: null
}

/*
main loop
- if there's no track, select a random track
- when the track ends, play the next track (if there's no queue, select a random one)

- disable adding same tracks to the queue
- use db
*/

function between(min, max) {  
  return Math.floor(
    Math.random() * (max - min) + min
  )
}

async function playNext() {
  console.log("playNext");
  var track = null;
  try {
    if (queue.length > 0) {
      // get the first track from the queue, updating it and saving it
      console.log("Pull track from the queue");
      track = queue.shift();
      storeQueue(queue);
    } else {
      // get a random track, queue remains empty, so no need to update it
      console.log("Get random next track");
      track = await getTrack(between(100, 3000));
    }
  } catch (error) {
    console.error(error);
    setTimeout(playNext, 5000); // Try again after 5 seconds
    return;
  }

  if (!track) {
    console.log("Couldn't get the track. Trying again");
    setTimeout(playNext, 5000); // Try again after 5 seconds
    return;
  }


  currentState.started = Date.now();
  currentState.track = track;
  currentState.length = track.data.attributes.metadata.length;

  storeState(currentState);

  console.log("playNext currentState", currentState);

  var data = {
    action: "play",
    track: track,
    started: currentState.started
  }
  // emit event to clients to play the track
  socketio.emit("event", data );

  // inform everyone which track is playing
  socketio.emit("message", botMessage(`Currently playing ${currentState.track.data.attributes.display_name} `));

  // add ability to cancel the timeout
  setTimeout(
    function() {
      console.log("playing next track");
      playNext();
    }, currentState.length * 1000);
  // broadcast to all to play this track
}

/*
- store chat log D
- add play command D
- pull track 
*/

function storeLog(type, item) {
  logs.push([type, item]);
  // console.log("logs", logs);

  storeHistory(type, item);
}

function storeEmit(socket, type, item) {
  console.log("item", item);
  if (!item || !item.time) {
    item['time'] = Date.now;
  }
  
  storeLog(type, item);
  socket.emit(type, item);

  if (type === 'message') {
    storeChat(item);
  }
}

function parseCmd(socket, data) {
  let args = data.message.split(" ")

  if (args[0] < 2) {
    console.log(`Command too short ${args[0]}`);
    socket.emit('message', botMessage(`Command too short ${args[0]}`));
    return;
  }

  const cmd = args.shift().slice(1);

  switch (cmd) {
    case 'p':
    case 'play':
      // Adds a song to the end of a track
      // Can be done using the track id or the track name
      // Min length of 2
      if (args.length == 0) {
        socket.emit('message', botMessage(`Command missing args: ${data.message}`));
      }else{
        socket.emit('message', botMessage(`Finding track ${args[0]} ...`));
        cmdPlay(socket, args);
      }
      break;
    
    case 'n':
    case 'next':
        // Skips the current track and plays the next one
        // Min length of 1
        socket.emit('message', botMessage(`Play next track`));
        playNext();
        break;

    case 'q':
    case 'queue':
      // Show the queue
      console.log("queue", queue);
      cmdShowQueue(socket) 
      break;
 
    default:
      console.log(`Sorry, we are out of ${cmd}. Did you mean some techno?!`);
  }
}

/*
!MOST OF THESE DO NOT WORK
cmds: /play formaviva.com/2390/shoshin
cmds: /p 2390/shoshin
cmds: /p kundi - shoshin
*/

function isNumeric(str) {
  if (typeof str != "string") return false // we only process strings!  
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
         !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

async function cmdShowQueue(socket) {
  console.log("cmdShowQueue");
  var queueTracks = '';
  for (let i = 0; i < queue.length; i++) {
    queueTracks += queue[i].data.attributes.display_name + '<br>';
  }
  socket.emit('message', botMessage(`Queue: ${queue.length} tracks<br>${queueTracks}`));
}

async function cmdPlay(socket, args) {
  console.log("cmdPlay", args);
  let track = null;

  if (isNumeric(args[0])) {
    let trackId = parseInt(args[0]);
    console.log("trackId", trackId);
    track = await getTrack(trackId);
  }

  if (track) {
    console.log("found track", track);
    queue.push(track);
    storeQueue(queue);
    socket.emit('message', botMessage(`Added <b>${track.data.attributes.display_name}</b> to the queue.`));
  } else {
    socket.emit('message', botMessage(`No such ${args[0]} track.`));
  }
  // make async
  // Why?

  console.log("queue", queue);
}


async function getTrack(trackId) {
  try {
    const r = await request({
      url: `https://api.formaviva.com/api/v1/tracks/${trackId}`,
      json: true
    });
    return r;
  } catch (error) {
    console.log(error.response.body);
    // throw new Error('Failed to get track');
    return false;
  }
}

function botMessage(message) {
  return {
    time: Date.now(),
    userName: 'FormaBot',
    message: message
  }
}

function sendLog(socket) {
  logs.forEach(function(log){
    socket.emit(log[0], log[1]);
  });
}

function initConnection(socket) {
  console.log("[initConnection] currentState", currentState);
  if (currentState.track) {
    socket.emit("event", { action: "play", track: currentState.track, started: currentState.started });
    socket.emit("message", botMessage(`Currently playing ${currentState.track.data.attributes.display_name} `));
  }
}

function uniqueUsername(userName) {
  // the username should be unique
  if (users.indexOf(userName) >= 0) {
    return false;
  }
  return true;
}

socketio.on('connection', function (socket) {
  console.log("A user connected. Socket id: " + socket.id);

  initConnection(socket);

  // on join
  socket.on('join', function (userName) {

    // Checks if the username is unique and returns an error if it is not
    // This can be extended to other types of tests
    var isUserNameUnique = uniqueUsername(userName);
    if (!isUserNameUnique) {
      console.log('Username already taken');
      socket.emit('userNameError', 'Username already taken');
      return;
    }
    console.log('Username accepted');
    socket.emit('userNameAccepted', userName);

    console.log('user change name to : ' + userName);

    socket.userName = userName;
    users.push(userName);

    // notice it is not socket.emit('refreshUserList', users)
    socketio.sockets.emit('refreshUserList', users);

    var data = {
      action: "joined",
      userName: "FormaBot",
      message: "A comrade " + userName + " joined the chat",
    }
    storeEmit(socketio, "event", data);
    storeEmit(socketio, "message", botMessage(`A comrade ${userName} joined the chat...`));
    socketio.sockets.emit('userCount', { count: users.length });

    // cool
    console.log("Sending socket log to the user");
    sendLog(socket);
    socket.emit("message", botMessage("Only for you"));
  });

  // on message
  socket.on('message', function (message) {
    console.log(socket.userName + ' says: ' + message);

    var data = {
      time: Date.now(),
      userName: socket.userName,
      message: message
    };

    // storeLog("message", data);
    // socketio.emit('message', data);
    storeEmit(socketio, "message", data);
    
    // parse command
    if (message[0] == '/')
      parseCmd(socketio, data);
  });

  // on disconnect
  socket.on('disconnect', function () {

    //when user log off, the name should be removed from the user list
    var removedUserIndex = users.indexOf(socket.userName);
    if (removedUserIndex >= 0) {
      users.splice(removedUserIndex, 1);

      socketio.sockets.emit('userCount', { count: users.length });

      storeEmit(socketio, "event", {
        action: "left",
        userName: socket.userName,
        message: "User " + socket.userName + " left"
      });
    }

    //notice it is not socket.emit('refreshUserList', users)
    socketio.sockets.emit('refreshUserList', users);

    console.log('user ' + socket.userName + ' disconnected');
  });
});

initializeDatabase();


async function initializePlayer() {
  // Recover the state from the database
  console.log("Recovering state...");
  await new Promise((resolve, reject) => {
    recoverState(function(state) {
      if (state) {
        currentState = state;
      }
      resolve();
    });
  });
  console.log("Recovered state", currentState);

  // Recover the chat from the database
  console.log("Recovering chat...");
  await new Promise((resolve, reject) => {
    recoverChats(function(chat) {
      socketio.emit('message', chat);
      resolve();
    });
  });
  console.log("Recovered chat");

  // Recover the history from the database
  console.log("Recovering history...");
  await new Promise((resolve, reject) => {
    recoverHistory(function(type, item) {
      socketio.emit(type, item);
      resolve();
    });
  });
  console.log("Recovered history");

  // Recover the queue from the database
  console.log("Recovering queue...");
  await new Promise((resolve, reject) => {
    recoverQueue(function(item) {
      console.log("Recovered queue", item);
      item.forEach((track) => {
        queue.push(track);
      });
      console.log("Recovered queue", queue.length);
      resolve();
    });
  });
  console.log("Recovered queue");

  console.log("playNext in initializePlayer");
  // If currentState is still empty, call playNext
  if (!currentState.started || !currentState.length || !currentState.track) {
    playNext();
  }
}

http.listen(port, function () {
  console.log("Running on port: " + port);
  initializePlayer();
});

function emitChangeVisuals(intervalInSeconds) {
  setInterval(() => {
    const randomNumber = Math.random(); // Generate a random number between 0 and 100
    socketio.emit('changeVisuals', randomNumber);
  }, intervalInSeconds * 1000);
}

// Call the function with the desired interval in seconds
emitChangeVisuals(45);