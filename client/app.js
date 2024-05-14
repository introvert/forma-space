// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);

// const { queue } = require("jquery");
// import { queue } from "jquery";

(function () {
  var socket = io();

  var vue = new Vue({
    el: "#app",
    data: {
      userName: "",
      track: null,
      audioContext: null, // new AudioContext(),
      queue: [],
      userList: [],
      userLoggedIn: false,
      message: "",
      messagesHist: [],
      userCount: 0, 
    },
    methods: {
      login: function (userName) {
        if (!userName.trim()) {  
          // Check if the username is empty or only contains whitespace
          // alert('Finally you have an opportunity to choose a great nickname by yourself and not someone else. Why not do it?');
          return;
        }

        // Await conformations from the server regarding the username
        new Promise((resolve, reject) => {
          socket.emit("join", userName);
          console.log("join", userName);

          // Waits to receive a response from the server, telling it there was an error with the wanted username
          socket.on('userNameError', function (data) {
            console.log('userNameError', data);
            alert(data);
            resolve();
          });

          // Waits to receive a response from the server, telling it the username was accepted
          socket.on('userNameAccepted', function (data) {
            userName = data;
            console.log('userNameAccepted 2', data);
            console.log(this.userName);
            
            vue.userName = userName;
            vue.userLoggedIn = true;

            resolve();    
            console.log(this.userName);
          });
        });
      },
      sendMessage: function (message) {
        if (message.trim() !== "") {
          socket.emit("message", message);
          this.message = "";
          this.scrollToBottom();
        }
        return false;
      },
      scrollToBottom: function() {
        this.$nextTick(() => {
          const container = this.$refs.chatHistory;
          container.scrollTop = container.scrollHeight;
        });
      },
      playAudio: function (url, startTime = 0) {
        console.log("playAudio called");
        if (!this.audioContext) {
          console.log("playAudio initAudioContext was not initialized");
          this.initAudioContext();
          // return;
        }

        console.log("playAudio now")

        var request = new XMLHttpRequest();
        var audioBuffer;

        var bitrate = 128 * 1000 / 8; // 16000 bytes per second
        // Calculate the byte range to request based on the start time and the file's bitrate
        var rangeStart = Math.floor(startTime * bitrate); // replace 'bitrate' with the actual bitrate

        request.open("GET", url, true);
        request.responseType = "arraybuffer";

        request.setRequestHeader("Range", "bytes=" + rangeStart + "-");

        request.onload = function () {
          this.audioContext.decodeAudioData(
            request.response,
            function (buffer) {
              var bufferSource = this.audioContext.createBufferSource();
              bufferSource.buffer = buffer;
              bufferSource.connect(this.audioContext.destination);
              // bufferSource.start(startTime);
              bufferSource.start(0);

              // Connect the audio stream to the visualizer
              // this.connectAudioStream(bufferSource);
              this.connectToAudioAnalyzer(bufferSource);

              bufferSource.onended = function () {
                console.log("Your audio has finished playing");
                this.playNext();
              }.bind(this);
            }.bind(this)
          );
        }.bind(this);

        request.send();
      },
      playNext: function () {
        if (this.queue.length > 0) {
          var track = this.queue.shift();
          this.track = track;
          this.playAudio(
            "http://localhost:3000/fwd?url=" +
              track.data.attributes.low_quality_url
          );
          console.log("Playing next track");
        }
      },
      initAudioContext: function() {
        console.log("initAudioContext");

        this.audioContext = new AudioContext();
        console.log("audioContext", this.audioContext);

        this.visualizer = butterchurn.default.createVisualizer(
          this.audioContext,
          document.getElementById("canvas"),
          {
            width: 800,
            height: 600,
            pixelRatio: window.devicePixelRatio || 1,
            textureRatio: 1,
          }
        );
        this.nextPreset();
        this.startRenderer();
      },
      initApp: function () {
        console.log("initApp");
        console.log("audioContext", this.audioContext);

        this.loadPresets();

        // Create the AudioContext only when a user gesture is made
        document.documentElement.addEventListener('mousedown', () => {
          if (!this.audioContext) {
            this.initAudioContext();
          } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
          }
        });
      },
      loadPresets: function() {
        this.presets = {};
        if (window.butterchurnPresets) {
          Object.assign(this.presets, butterchurnPresets.getPresets());
        }
        if (window.butterchurnPresetsExtra) {
          Object.assign(this.presets, butterchurnPresetsExtra.getPresets());
        }
      },
      startRenderer: function() {
        requestAnimationFrame(() => this.startRenderer());
        this.visualizer.render();
      },
      nextPreset: function(randomValue = null) {
        var presetIndex = 0;
        var blendTime = 5.7;

        console.log("presets", this.presets);

        var presetKeys = Object.keys(this.presets);

        if (!randomValue) {
          randomValue = Math.random();
        }
        presetIndex = Math.floor(randomValue * presetKeys.length);

        // console.log("presetKeys", presetKeys);
        console.log("presetIndex", presetIndex);

        var preset = this.presets[presetKeys[presetIndex]];
        console.log("preset", preset);

        this.visualizer.loadPreset(preset, blendTime);
      },
      connectToAudioAnalyzer: function(sourceNode) {
        console.log("connectToAudioAnalyzer");
        if (this.delayedAudible) {
          this.delayedAudible.disconnect();
        }

        this.delayedAudible = this.audioContext.createDelay();
        this.delayedAudible.delayTime.value = 0.26;

        sourceNode.connect(this.delayedAudible)
        // this.delayedAudible.connect(this.audioContext.destination);

        console.log("delayedAudible", this.delayedAudible);
        this.visualizer.connectAudio(this.delayedAudible);
        return this.delayedAudible;
      },
      connectAudioStream: function (stream) {
        if (this.sourceNode) {
          this.sourceNode.disconnect();
        }

        this.sourceNode = this.audioContext.createMediaStreamSource(stream);
        this.visualizer.connectAudio(this.sourceNode);
      },
      playCurrentTrack: function() {
        if (this.track) {

          var elapsedSeconds = 0;
          if (this.trackStarted) {
            var now = Date.now();
            console.log("dataStarted", this.trackStarted)
            var elapsed = now - this.trackStarted; // Time elapsed in milliseconds
            var elapsedSeconds = elapsed / 1000; // Convert to seconds
          }

          console.log("elapsedSeconds", elapsedSeconds);

          this.playAudio(
            "http://localhost:3000/fwd?url=" +
              this.track.data.attributes.low_quality_url,
            elapsedSeconds
          );
        }
      },
      initSocket: function () {
        socket.on(
          "message",
          function (data) {
            this.messagesHist.push(data);
            this.scrollToBottom();
          }.bind(this)
        );

        socket.on(
          "event",
          function (data) {
            // this.messagesHist.push(data);

            if (data.action == "play") {
              console.log("play the track", data.track);

              if (this.track == null) {
                this.track = data.track;
                this.trackStarted = data.started;

                // this.playAudio("http://localhost:3000/song.mp3");
                // this.playAudio(
                //   "http://localhost:3000/fwd?url=" +
                //     data.track.data.attributes.low_quality_url,
                //     elapsedSeconds
                // );
                this.playCurrentTrack();
              } else {
                this.queue.push(data.track);
              }
            }
          }.bind(this)
        );

        socket.on(
          "refreshUserList",
          function (users) {
            this.userList = users;
          }.bind(this)
        );

        socket.on(
          "connect",
          function () {
            console.log("connected");
            console.log(socket.connected); // true

            // login
            console.log("username", this.userName);

            if (this.userName) {
              console.log("Logging back");
              this.login(this.userName);
            }
          }.bind(this)
        );

        socket.on(
          "disconnect",
          function (err) {
            console.log("disconnected");
            console.log("disconnect", err);
          }.bind(this)
        );

        socket.on('userCount', function (data) {
          console.log('Number of users: ' + data.count);
          // Update UI here
          this.userCount = data.count;
        }.bind(this));

        socket.on('changeVisuals', function (randomValue) {
          console.log("change visuals request", randomValue);
          this.nextPreset(randomValue);
        }.bind(this));
      },
    },
    computed: {
      // a computed getter
      timeLeft: function () {
        // `this` points to the vm instance
        return this.message.split("").reverse().join("");
      },
    },
  });

  vue.initApp();
  vue.initSocket();
})();
