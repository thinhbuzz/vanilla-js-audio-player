# Audio Player (Vanilla JS + CSS)

Thư viện Audio Player nhẹ, không phụ thuộc thư viện ngoài. Hỗ trợ ES Module để nhúng nhanh.

## Cấu trúc thư mục

```
/audio
  file_example_MP3.mp3
  file_example_WAV.wav
/src
  audio-player.js
  audio-player.css
index.html
index.js
README.md
```

## Quick start

### ES Module

```html
<link rel="stylesheet" href="./src/audio-player.css" />
<div id="player"></div>
<script type="module">
  import AudioPlayer from "./src/audio-player.js";

  const player = new AudioPlayer("#player", {
    volume: 70,
    playbackRate: 1,
  });
  player.load("./audio/file_example_MP3.mp3", {
    title: "Sample MP3",
    filename: "sample.mp3",
  });
</script>
```


## Khởi tạo

```js
const player = new AudioPlayer(container, options);
```

- `container`: DOM element hoặc selector string
- `options`: object cấu hình ban đầu

### Ví dụ setOptions

```js
player.setOptions({ volume: 50 });
```

### Ví dụ lắng nghe events

```js
player.on("ratechange", ({ rate }) => {
  console.log("rate:", rate);
});

player.on("volumechange", ({ volume }) => {
  console.log("volume:", volume);
});
```

Hoặc đăng ký qua `options`:

```js
const player = new AudioPlayer("#player", {
  events: {
    play: () => console.log("play"),
  },
  on: (on) => {
    on("pause", () => console.log("pause"));
  },
});
```

## Options

```js
{
  src: "",
  volume: 70,          // 0..100
  muted: false,
  playbackRate: 1,
  playbackRateMin: 0.5,
  playbackRateMin: 0.2,
  playbackRateMax: 2,
  playbackRateStep: 0.05,
  seekStep: 10,
  allowDownload: true,
  showTime: true,
  theme: "auto" | "light" | "dark",
  downloadFilename: null,
  ariaLabelPrefix: "Audio player",
}
```

## API Reference (ngắn gọn)

- `setOptions(optionsPartial)`
- `getOptions()`
- `load(src, meta?)`  
  `meta: { title, filename, allowDownload }`
- `play()`, `pause()`, `toggle()`
- `seek(seconds)`, `seekBy(deltaSeconds)`
- `setPlaybackRate(rate)`
- `setVolume(volume0to100)`
- `mute()`, `unmute()`, `toggleMute()`
- `on(name, handler)`, `off(name, handler)`, `emit(name, payload)`
- `destroy()`

## Events

- `ready` `{ duration, src }`
- `play`, `pause`, `ended`
- `timeupdate` `{ currentTime, duration }` (được throttle)
- `seek` `{ from, to }`
- `ratechange` `{ rate }`
- `volumechange` `{ volume }`
- `mutechange` `{ muted }`
- `optionschange` `{ changedKeys, options }`
- `download` `{ src, filename }`
- `error` `{ error }`
- `srcchange` `{ src }`

## Demo

- Mở `index.html`
