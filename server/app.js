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
  });
}

function storeState(state) {
  db.run("INSERT INTO state (started, length, track) VALUES (?, ?, ?)", [state.started, state.length, JSON.stringify(state.track)]);
}

function storeChat(chat) {
  db.run("INSERT INTO chats (time, userName, message) VALUES (?, ?, ?)", [chat.time, chat.userName, chat.message]);
}

function storeHistory(type, item) {
  db.run("INSERT INTO history (type, item) VALUES (?, ?)", [type, JSON.stringify(item)]);
}

function recoverState(callback) {
  db.get("SELECT * FROM state ORDER BY rowid DESC LIMIT 1", [], (err, row) => {
    if (row) {
      callback({
        started: row.started,
        length: row.length,
        track: JSON.parse(row.track)
      });
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
  var track = null;
  try {
    if (queue.length > 0) {
      console.log("Pull track from the queue");
      track = queue.shift();
    } else {
      console.log("Get random next track");
      track = await getTrack(between(0, 3000));
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
  console.log("logs", logs);

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
  if (args.length < 2) {
    console.log(`Command missing args: ${data.message}`);
    socket.emit('message', botMessage(`Command missing args: ${data.message}`));
    // send message back
    return;
  }

  if (args[0] < 2) {
    console.log(`Command too short ${args[0]}`);
    socket.emit('message', botMessage(`Command too short ${args[0]}`));
    return;
  }

  const cmd = args.shift().slice(1);
  // let cmd = args[0].slice(1);
  switch (cmd) {
    case 'p':
    case 'play':
      // play a args[1] track
      socket.emit('message', botMessage(`Finding track ${args[0]} ...`));
      cmdPlay(socket, args);
      break;
    
    case 'n':
    case 'next':
        // play a args[1] track
        socket.emit('message', botMessage(`Play next track`));
        playNext();
        break;

    default:
      console.log(`Sorry, we are out of ${cmd}. Did you mean some techno?!`);
  }
}

/*
cmds: /play formaviva.com/2390/shoshin
cmds: /p 2390/shoshin
cmds: /p kundi - shoshin
*/

function isNumeric(str) {
  if (typeof str != "string") return false // we only process strings!  
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
         !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

async function cmdPlay(socket, args) {
  // check if valid track
  // if ()
  console.log("cmdPlay", args);

  let track = null;

  if (isNumeric(args[0])) {
    let trackId = parseInt(args[0]);
    track = await getTrack(trackId);
  }

  if (track) {
    console.log("found track", track);
    queue.push(track);
    socket.emit('message', botMessage(`Added <b>${track.data.attributes.display_name}</b> to the queue.`));
  } else {
    socket.emit('message', botMessage(`No such ${args[0]} track.`));
  }
  // make async

  console.log("queue", queue);
}

/*
function getTrack(trackId) {
  request({
    url: 'https://api.formaviva.com/api/v1/tracks/14120',
    json: true
  }, function(error, response, body) {
    console.log(body);
  });

}
*/

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
  console.log("currentState", currentState);
  if (currentState.track) {
    socket.emit("event", { action: "play", track: currentState.track, started: currentState.started });
    socket.emit("message", botMessage(`Currently playing ${currentState.track.data.attributes.display_name} `));
  }
}

socketio.on('connection', function (socket) {
  console.log("A user connected. Socket id: " + socket.id);

  initConnection(socket);

  // on join
  socket.on('join', function (userName) {
    console.log('user change name to : ' + userName);

    socket.userName = userName;
    users.push(userName);

    // socketio.sockets.emit('message', botMessage("A comrade " + userName + " joined the chat"));
    // notice it is not socket.emit('refreshUserList', users)
    socketio.sockets.emit('refreshUserList', users);

    // storeLog("event", { action: "joined", user: userName });
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


function initializePlayer() {
  recoverState(function(state) {
    currentState = state;
    playNext();
  });

  recoverChats(function(chat) {
    socketio.emit('message', chat);
  });

  recoverHistory(function(type, item) {
    socketio.emit(type, item);
  });

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