"use strict"

var express = require('express');

var app = express();

var http = require('http').Server(app);
var socketio = require('socket.io')(http);

var port = process.env.port || 3000;

app.use(express.static(__dirname + "/../Client"));
app.use(express.static(__dirname + "/../node_modules"));

var users = [];
var queue = [];
var logs = [];


/*
- store chat log
- add play command
- pull track
*/

function storeLog(type, item) {
  logs.push([type, item]);
  console.log("logs", logs);
}

function parseStoreEmit(socket, type, item) {
  if (!item.time)
    item.time = Date.now
  
  storeLog(type, item);
  socket.emit(type, item);
}

function parseCmd(socket, message) {
  let cmd = myStr.split(" ")[0]
}

function getNextTrack() {
  
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

socketio.on('connection', function (socket) {
  console.log("A user connected. Socket id: " + socket.id);

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

    // cool
    console.log("Sending socket log to the user");
    sendLog(socket);
    socket.emit("message", botMessage("Only for you"));
  });

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
    
    // parse message
  });

  socket.on('disconnect', function () {

    //when user log off, the name should be removed from the user list
    var removedUserIndex = users.indexOf(socket.userName);
    if (removedUserIndex >= 0) {
      users.splice(removedUserIndex, 1);
    }

    //notice it is not socket.emit('refreshUserList', users)
    socketio.sockets.emit('refreshUserList', users);

    storeEmit("event", {
      action: "left",
      user: socket.userName,
      message: "User " + socket.userName + " left"
    });

    console.log('user ' + socket.userName + ' disconnected');
  });
});

http.listen(port, function () {
  console.log("Running on port: " + port);
});