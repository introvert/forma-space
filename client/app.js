// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);

// const { queue } = require("jquery");
// import { queue } from "jquery";

(function () {
  var socket = io();

  var vue = new Vue({
    el: '#app',
    data: {
      userName: "",
      track: null,
      audioContext: new AudioContext(),
      queue: [],
      userList: [],
      userLoggedIn: false,
      message: "",
      messagesHist: []
    },
    methods: {
      login: function (userName) {
        socket.emit('join', userName);
        this.userName = userName;
        console.log("username", this.userName);
        this.userLoggedIn = true;
      },
      sendMessage: function (message) {
        socket.emit('message', message);
        this.message = "";
        return false;
      },
      playMp3: function (url) {
        var request = new XMLHttpRequest();
        var audioBuffer;
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        request.onload = function(){
          this.audioContext.decodeAudioData(request.response, onDecoded.bind(this));
        }.bind(this);
    
        function onDecoded(buffer){
          var bufferSource = this.audioContext.createBufferSource();
          bufferSource.buffer = buffer;
          bufferSource.connect(this.audioContext.destination);
          //bufferSource.addEventListener('ended', playNext());
          bufferSource.start();
          bufferSource.onended = function() {
            console.log('Your audio has finished playing');
            this.playNext();
          }.bind(this);
        }
    
        request.send();
      },
      playNext: function() {
        if (this.queue.length > 0) {
          var track = this.queue.shift();
          this.track = track;
          this.playMp3("http://localhost:3000/fwd?url=" + track.data.attributes.low_quality_url);
          console.log("Playing next track");
        }
      },
      initApp: function () {
        this.audioContext = new AudioContext();
        console.log("audioContext", this.audioContext);
      },
      initSocket: function () {
        socket.on('message', function (data) {
          this.messagesHist.push(data);
        }.bind(this));

        socket.on('event', function (data) {
          // this.messagesHist.push(data);

          if (data.action == 'play') {
            console.log("play the track", data.track);
            
            if (this.track == null) {
              this.track = data.track;
              // this.playMp3("http://localhost:3000/song.mp3");
              this.playMp3("http://localhost:3000/fwd?url=" + data.track.data.attributes.low_quality_url);
            }
            else {
              this.queue.push(data.track);
            }
            
          }
        }.bind(this));

        socket.on('refreshUserList', function (users) {
          this.userList = users;
        }.bind(this));

        socket.on("connect", function () {
          console.log("connected");
          console.log(socket.connected); // true

          // login
          console.log("username", this.userName);

          if (this.userName) {
            console.log("Logging back");
            this.login(this.userName);
          }
        }.bind(this));

        socket.on('disconnect', function (err) {
          console.log("disconnected");
          console.log("disconnect", err);
        }.bind(this));
      }
    },
    computed: {
      // a computed getter
      timeLeft: function () {
        // `this` points to the vm instance
        return this.message.split('').reverse().join('')
      }
    }
  });

  vue.initApp();
  vue.initSocket();
}());