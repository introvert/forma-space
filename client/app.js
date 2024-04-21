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
    },
    methods: {
      login: function (userName) {
        socket.emit("join", userName);
        this.userName = userName;
        console.log("username", this.userName);
        this.userLoggedIn = true;
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
      playMp3: function (url) {
        console.log("playMp3 called");
        if (!this.audioContext) {
          console.log("playMp3 initAudioContext was not initialized");
          this.initAudioContext();
          // return;
        }

        console.log("playMp3 now")

        var request = new XMLHttpRequest();
        var audioBuffer;
        request.open("GET", url, true);
        request.responseType = "arraybuffer";
        request.onload = function () {
          this.audioContext.decodeAudioData(
            request.response,
            function (buffer) {
              var bufferSource = this.audioContext.createBufferSource();
              bufferSource.buffer = buffer;
              bufferSource.connect(this.audioContext.destination);
              bufferSource.start();

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
          this.playMp3(
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
                // this.playMp3("http://localhost:3000/song.mp3");
                this.playMp3(
                  "http://localhost:3000/fwd?url=" +
                    data.track.data.attributes.low_quality_url
                );
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
