"use strict"

var express = require('express');

var app = express();

// var request = require('request');
const request = require("request-promise");

var http = require('http').Server(app);
var socketio = require('socket.io')(http);

var port = process.env.port || 3000;

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
  if (queue.length > 0) {
    // get random track
    // pop first item from the queue
    console.log("Pull track from the queue");
    track = queue.shift(); // queue[0];
  } else {
    console.log("Get random next track");
    /*
    try {
      track = await getTrack(between(0, 3000));
    } catch (error) {
      console.log(error);
      playNext();
      return;
    }
    */

    track = await getTrack(between(0, 3000));
    // console.log(track);
  }

  if (!track) {
    console.log("Couldn't get the track. Trying again");
    playNext();
    return;
  }

  currentState.started = Date.now;
  currentState.track = track;
  currentState.length = track.data.attributes.metadata.length;

  // emit event to clients to play the track
  socketio.emit("event", { action: "play", track: track });

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
}

function storeEmit(socket, type, item) {
  console.log("item", item);
  if (!item || !item.time) {
    item['time'] = Date.now;
  }
  
  storeLog(type, item);
  socket.emit(type, item);
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
    return false;
  }
}

function botMessage(message) {
  return {
    time: Date.now,
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
    socket.emit("event", { action: "play", track: currentState.track });
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

http.listen(port, function () {
  console.log("Running on port: " + port);
  playNext();
});