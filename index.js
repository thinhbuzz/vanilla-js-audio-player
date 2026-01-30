import AudioPlayer from "./src/audio-player.js";

const playerOne = new AudioPlayer("#player-one", {
  volume: 70,
  playbackRate: 1,
  theme: "auto",
});
playerOne.load("./audio/file_example_MP3.mp3", {
  title: "",
  filename: "sample-audio.mp3",
});

const playerTwo = new AudioPlayer("#player-two", {
  volume: 50,
  playbackRate: 1.25,
  theme: "dark",
  allowDownload: false,
  events: {
    ratechange: (payload) => console.log("ratechange:", payload),
    volumechange: (payload) => console.log("volumechange:", payload),
    optionschange: ({ changedKeys, options }) => console.log("optionschange:", changedKeys, options),
  },
});
playerTwo.load("./audio/file_example_WAV.wav", {
  title: "Sample WAV",
});
