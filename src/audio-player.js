export const DEFAULT_OPTIONS = {
  src: "",
  volume: 100, // 0..100
  muted: false,
  playbackRate: 1,
  playbackRateMin: 0.2,
  playbackRateMax: 2,
  playbackRateStep: 0.05,
  seekStep: 10,
  allowDownload: true,
  showTime: true,
  theme: "auto", // "auto" | "light" | "dark"
  downloadFilename: null,
  ariaLabelPrefix: "Audio player",
};

export const EVENTS = [
  "ready",
  "play",
  "pause",
  "ended",
  "timeupdate",
  "seek",
  "ratechange",
  "volumechange",
  "mutechange",
  "optionschange",
  "download",
  "error",
  "srcchange",
];

export function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(max, Math.max(min, num));
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatRate(rate) {
  if (!Number.isFinite(rate)) return "1x";
  const rounded = Math.round(rate * 100) / 100;
  const text = rounded.toFixed(2);
  return `${text}x`;
}

export function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === "string") el.textContent = text;
  return el;
}

export class AudioPlayer {
  constructor(container, options = {}) {
    const resolved =
      typeof container === "string"
        ? document.querySelector(container)
        : container;
    if (!resolved) {
      throw new Error("AudioPlayer: container not found.");
    }

    this._container = resolved;
    this._events = new Map();
    this._listeners = [];
    this._destroyed = false;
    this._lastTimeEmit = 0;
    this._rafId = null;

    this._meta = {
      title: "",
      filename: null,
      allowDownload: undefined,
    };

    this._options = this._mergeOptions(DEFAULT_OPTIONS, options, true);

    this._buildUI();
    this._bindUI();

    this.setOptions(this._options, true);

    this._registerOptionEvents(options);

    if (this._options.src) {
      this.load(this._options.src, options.meta || {});
    }
  }

  on(name, handler) {
    if (!EVENTS.includes(name) || typeof handler !== "function") return;
    if (!this._events.has(name)) this._events.set(name, new Set());
    this._events.get(name).add(handler);
  }

  off(name, handler) {
    const set = this._events.get(name);
    if (!set) return;
    set.delete(handler);
  }

  emit(name, payload) {
    const set = this._events.get(name);
    if (!set || !set.size) return;
    set.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        // Avoid breaking main flow on handler error
        console.error("[AudioPlayer] handler error:", error);
      }
    });
  }

  getOptions() {
    return {
      ...this._options,
    };
  }

  resetOptions(partial = {}) {
    return this.setOptions({ ...DEFAULT_OPTIONS, ...partial });
  }

  _getLiveOptions() {
    const base = this.getOptions();
    if (!this._audio) return base;
    return {
      ...base,
      volume: Math.round(this._audio.volume * 100),
      muted: this._audio.muted,
      playbackRate: this._audio.playbackRate,
    };
  }

  setOptions(partial = {}) {
    if (!partial || typeof partial !== "object") return this.getOptions();

    const previous = { ...this._options };
    const next = { ...this._options };

    if ("volume" in partial) {
      const volume = clampNumber(partial.volume, 0, 100);
      if (volume !== null && volume !== next.volume) {
        next.volume = volume;
      }
    }

    if ("muted" in partial) {
      const muted = Boolean(partial.muted);
      if (muted !== next.muted) {
        next.muted = muted;
      }
    }

    if ("playbackRate" in partial) {
      const rate = clampNumber(
        partial.playbackRate,
        next.playbackRateMin,
        next.playbackRateMax
      );
      if (rate !== null && rate !== next.playbackRate) {
        next.playbackRate = rate;
      }
    }

    if ("seekStep" in partial) {
      const seekStep = clampNumber(partial.seekStep, 1, 120);
      if (seekStep !== null && seekStep !== next.seekStep) {
        next.seekStep = seekStep;
      }
    }

    if ("allowDownload" in partial) {
      const allowDownload = Boolean(partial.allowDownload);
      if (allowDownload !== next.allowDownload) {
        next.allowDownload = allowDownload;
      }
    }

    if ("playbackRateMin" in partial) {
      const minRate = clampNumber(partial.playbackRateMin, 0.2, 4);
      if (minRate !== null && minRate !== next.playbackRateMin) {
        next.playbackRateMin = minRate;
      }
    }

    if ("playbackRateMax" in partial) {
      const maxRate = clampNumber(partial.playbackRateMax, 0.2, 4);
      if (maxRate !== null && maxRate !== next.playbackRateMax) {
        next.playbackRateMax = maxRate;
      }
    }

    if ("playbackRateStep" in partial) {
      const step = clampNumber(partial.playbackRateStep, 0.01, 1);
      if (step !== null && step !== next.playbackRateStep) {
        next.playbackRateStep = step;
      }
    }

    if (next.playbackRateMin > next.playbackRateMax) {
      const temp = next.playbackRateMin;
      next.playbackRateMin = next.playbackRateMax;
      next.playbackRateMax = temp;
    }

    const clampedRate = clampNumber(
      next.playbackRate,
      next.playbackRateMin,
      next.playbackRateMax
    );
    if (clampedRate !== null && clampedRate !== next.playbackRate) {
      next.playbackRate = clampedRate;
    }

    if ("showTime" in partial) {
      const showTime = Boolean(partial.showTime);
      if (showTime !== next.showTime) {
        next.showTime = showTime;
      }
    }

    if ("theme" in partial) {
      const theme =
        typeof partial.theme === "string" && partial.theme.trim()
          ? partial.theme.trim()
          : DEFAULT_OPTIONS.theme;
      if (theme !== next.theme) {
        next.theme = theme;
      }
    }

    if ("downloadFilename" in partial) {
      const filename =
        typeof partial.downloadFilename === "string" &&
        partial.downloadFilename.trim()
          ? partial.downloadFilename.trim()
          : null;
      if (filename !== next.downloadFilename) {
        next.downloadFilename = filename;
      }
    }

    if ("ariaLabelPrefix" in partial) {
      const ariaLabelPrefix =
        typeof partial.ariaLabelPrefix === "string" &&
        partial.ariaLabelPrefix.trim()
          ? partial.ariaLabelPrefix.trim()
          : DEFAULT_OPTIONS.ariaLabelPrefix;
      if (ariaLabelPrefix !== next.ariaLabelPrefix) {
        next.ariaLabelPrefix = ariaLabelPrefix;
      }
    }

    if ("src" in partial) {
      const src = typeof partial.src === "string" ? partial.src : "";
      if (src !== next.src) {
        next.src = src;
      }
    }

    this._options = next;
    this._applyOptions();

    if ("src" in partial) {
      if (this._options.src) {
        this.load(this._options.src, {}, previous.src);
      }
    }

    return this.getOptions();
  }

  load(src, meta = {}, previousSrc = null) {
    if (!src || typeof src !== "string") return;
    const previous = previousSrc ?? this._audio.src;

    this._audio.pause();
    this._updatePlayState();
    this._stopProgressLoop();

    this._meta.title =
      typeof meta.title === "string" ? meta.title.trim() : "";
    this._meta.filename =
      typeof meta.filename === "string" && meta.filename.trim()
        ? meta.filename.trim()
        : null;
    this._meta.allowDownload =
      typeof meta.allowDownload === "boolean" ? meta.allowDownload : undefined;

    this._options.src = src;
    this._audio.src = src;
    this._audio.load();
    this._audio.playbackRate = this._options.playbackRate;
    this._updateRateUI();
    this._audio.volume = this._options.volume / 100;
    this._audio.muted = this._options.muted;
    this._updateVolumeUI(true);
    this._updateTitle();
    this._syncDownloadState();
    this._dom.currentTime.textContent = "0:00";
    this._dom.duration.textContent = "0:00";
    this._dom.progressRange.value = "0";
    this._dom.progressRange.max = "0";

    if (src !== previous) {
      this.emit("srcchange", { src });
    }
  }

  play() {
    if (this._destroyed) return;
    this._audio.play().catch((error) => {
      this.emit("error", { error });
    });
  }

  pause() {
    if (this._destroyed) return;
    this._audio.pause();
  }

  toggle() {
    if (this._audio.paused) this.play();
    else this.pause();
  }

  seek(seconds) {
    if (!Number.isFinite(this._audio.duration)) return;
    const from = this._audio.currentTime;
    const to = Math.max(0, Math.min(this._audio.duration, seconds));
    if (from === to) return;
    this._audio.currentTime = to;
    this._syncProgress();
    this.emit("seek", { from, to });
  }

  seekBy(deltaSeconds) {
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta)) return;
    this.seek(this._audio.currentTime + delta);
  }

  setPlaybackRate(rate) {
    const value = clampNumber(
      rate,
      this._options.playbackRateMin,
      this._options.playbackRateMax
    );
    if (value === null) return;
    this._audio.playbackRate = value;
  }

  setVolume(volume0to100) {
    const value = clampNumber(volume0to100, 0, 100);
    if (value === null) return;
    this._audio.volume = value / 100;
    if (value > 0 && this._audio.muted) this._audio.muted = false;
  }

  mute() {
    this._audio.muted = true;
  }

  unmute() {
    this._audio.muted = false;
  }

  toggleMute() {
    this._audio.muted = !this._audio.muted;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopProgressLoop();
    this._listeners.forEach(({ el, event, handler, options }) => {
      el.removeEventListener(event, handler, options);
    });
    this._listeners = [];
    if (this._audio) {
      this._audio.pause();
      this._audio.src = "";
    }
    if (this._dom?.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
    this._audio = null;
    this._events.clear();
  }

  _mergeOptions(base, override, includeUnknown = false) {
    const merged = { ...base };
    Object.keys(override || {}).forEach((key) => {
      if (includeUnknown || key in base) merged[key] = override[key];
    });
    merged.theme =
      typeof merged.theme === "string" && merged.theme.trim()
        ? merged.theme.trim()
        : base.theme;
    merged.volume = clampNumber(merged.volume, 0, 100) ?? base.volume;
    merged.playbackRateMin =
      clampNumber(merged.playbackRateMin, 0.2, 4) ?? base.playbackRateMin;
    merged.playbackRateMax =
      clampNumber(merged.playbackRateMax, 0.2, 4) ?? base.playbackRateMax;
    merged.playbackRateStep =
      clampNumber(merged.playbackRateStep, 0.01, 1) ?? base.playbackRateStep;
    if (merged.playbackRateMin > merged.playbackRateMax) {
      const temp = merged.playbackRateMin;
      merged.playbackRateMin = merged.playbackRateMax;
      merged.playbackRateMax = temp;
    }
    merged.playbackRate =
      clampNumber(
        merged.playbackRate,
        merged.playbackRateMin,
        merged.playbackRateMax
      ) ?? 1;
    merged.seekStep = clampNumber(merged.seekStep, 1, 120) ?? base.seekStep;
    merged.muted = Boolean(merged.muted);
    merged.allowDownload = Boolean(merged.allowDownload);
    merged.showTime = Boolean(merged.showTime);
    merged.downloadFilename =
      typeof merged.downloadFilename === "string" &&
      merged.downloadFilename.trim()
        ? merged.downloadFilename.trim()
        : null;
    merged.ariaLabelPrefix =
      typeof merged.ariaLabelPrefix === "string" &&
      merged.ariaLabelPrefix.trim()
        ? merged.ariaLabelPrefix.trim()
        : base.ariaLabelPrefix;
    merged.src = typeof merged.src === "string" ? merged.src : "";
    return merged;
  }

  _registerOptionEvents(options) {
    if (options && typeof options.on === "function") {
      // Allow: new AudioPlayer(el, { on: (on) => { on("play", fn) } })
      options.on(this.on.bind(this));
    } else if (options && options.on && typeof options.on === "object") {
      Object.entries(options.on).forEach(([name, handler]) =>
        this.on(name, handler)
      );
    }

    if (options && options.events && typeof options.events === "object") {
      Object.entries(options.events).forEach(([name, handler]) =>
        this.on(name, handler)
      );
    }
  }

  _buildUI() {
    const root = createElement("div", "ap-player");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", this._options.ariaLabelPrefix);

    const titleRow = createElement("div", "ap-title-row");
    const title = createElement("div", "ap-title");
    titleRow.appendChild(title);

    const controls = createElement("div", "ap-controls");

    const playBtn = createElement("button", "ap-btn ap-play");
    playBtn.type = "button";
    playBtn.setAttribute("aria-label", "Play");
    playBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="ap-icon ap-icon-play" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
      </svg>
      <svg viewBox="0 0 24 24" class="ap-icon ap-icon-pause" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
      </svg>
    `;

    const rewindBtn = createElement(
      "button",
      "ap-btn ap-rewind"
    );
    rewindBtn.type = "button";
    rewindBtn.setAttribute(
      "aria-label",
      `Rewind ${this._options.seekStep} seconds`
    );
    rewindBtn.innerHTML = `<svg viewBox="0 0 1024 1024" class="ap-icon ap-icon-forward" aria-hidden="true">
  <path fill="currentColor" d="M511.4 124C290.5 124.3 112 303 112 523.9c0 128 60.2 242 153.8 315.2l-37.5 48c-4.1 5.3-.3 13 6.3 12.9l167-.8c5.2 0 9-4.9 7.7-9.9L369.8 727a8 8 0 0 0-14.1-3L315 776.1c-10.2-8-20-16.7-29.3-26a318.64 318.64 0 0 1-68.6-101.7C200.4 609 192 567.1 192 523.9s8.4-85.1 25.1-124.5c16.1-38.1 39.2-72.3 68.6-101.7 29.4-29.4 63.6-52.5 101.7-68.6C426.9 212.4 468.8 204 512 204s85.1 8.4 124.5 25.1c38.1 16.1 72.3 39.2 101.7 68.6 29.4 29.4 52.5 63.6 68.6 101.7 16.7 39.4 25.1 81.3 25.1 124.5s-8.4 85.1-25.1 124.5a318.64 318.64 0 0 1-68.6 101.7c-7.5 7.5-15.3 14.5-23.4 21.2a7.93 7.93 0 0 0-1.2 11.1l39.4 50.5c2.8 3.5 7.9 4.1 11.4 1.3C854.5 760.8 912 649.1 912 523.9c0-221.1-179.4-400.2-400.6-399.9z"/>
  <text x="512" y="560"
        fill="currentColor"
        font-weight="800"
        font-size="300"
        text-anchor="middle"
        dominant-baseline="middle"
        data-num="${this._options.seekStep}">
    <tspan>${this._options.seekStep}</tspan>
  </text>
</svg>`;

    const forwardBtn = createElement(
      "button",
      "ap-btn ap-forward"
    );
    forwardBtn.type = "button";
    forwardBtn.setAttribute(
      "aria-label",
      `Forward ${this._options.seekStep} seconds`
    );
    forwardBtn.innerHTML = `<svg viewBox="0 0 1024 1024" class="ap-icon ap-icon-forward" aria-hidden="true">
  <g transform="translate(1024 0) scale(-1 1)">
    <path fill="currentColor" d="M511.4 124C290.5 124.3 112 303 112 523.9c0 128 60.2 242 153.8 315.2l-37.5 48c-4.1 5.3-.3 13 6.3 12.9l167-.8c5.2 0 9-4.9 7.7-9.9L369.8 727a8 8 0 0 0-14.1-3L315 776.1c-10.2-8-20-16.7-29.3-26a318.64 318.64 0 0 1-68.6-101.7C200.4 609 192 567.1 192 523.9s8.4-85.1 25.1-124.5c16.1-38.1 39.2-72.3 68.6-101.7 29.4-29.4 63.6-52.5 101.7-68.6C426.9 212.4 468.8 204 512 204s85.1 8.4 124.5 25.1c38.1 16.1 72.3 39.2 101.7 68.6 29.4 29.4 52.5 63.6 68.6 101.7 16.7 39.4 25.1 81.3 25.1 124.5s-8.4 85.1-25.1 124.5a318.64 318.64 0 0 1-68.6 101.7c-7.5 7.5-15.3 14.5-23.4 21.2a7.93 7.93 0 0 0-1.2 11.1l39.4 50.5c2.8 3.5 7.9 4.1 11.4 1.3C854.5 760.8 912 649.1 912 523.9c0-221.1-179.4-400.2-400.6-399.9z"/>
  </g>

  <text x="512" y="560"
        fill="currentColor"
        font-weight="800"
        font-size="300"
        text-anchor="middle"
        dominant-baseline="middle"
        data-num="${this._options.seekStep}">
    <tspan>${this._options.seekStep}</tspan>
  </text>
</svg>`;

    const rateWrap = createElement("div", "ap-rate");
    const rateButton = createElement("button", "ap-btn ap-rate-btn");
    rateButton.type = "button";
    rateButton.setAttribute("aria-label", "Playback speed");
    rateButton.setAttribute("aria-haspopup", "dialog");
    rateButton.setAttribute("aria-expanded", "false");
    const rateValue = createElement("span", "ap-rate-value", "1x");
    rateButton.appendChild(rateValue);
    rateButton.insertAdjacentHTML(
      "beforeend",
      `
        <svg class="ap-icon ap-icon-caret" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6z"></path>
        </svg>
      `
    );

    const ratePopover = createElement("div", "ap-rate-popover");
    ratePopover.setAttribute("role", "dialog");
    ratePopover.setAttribute("aria-label", "Playback speed");
    const ratePopoverRow = createElement("div", "ap-rate-popover-row");
    const ratePopoverLabel = createElement(
      "span",
      "ap-rate-popover-label",
      "Speed"
    );
    const ratePopoverValue = createElement(
      "span",
      "ap-rate-popover-value",
      "1x"
    );
    ratePopoverRow.appendChild(ratePopoverLabel);
    ratePopoverRow.appendChild(ratePopoverValue);
    const rateSlider = createElement("input", "ap-rate-slider");
    rateSlider.type = "range";
    rateSlider.min = String(this._options.playbackRateMin);
    rateSlider.max = String(this._options.playbackRateMax);
    rateSlider.step = "0.1";
    rateSlider.setAttribute("aria-label", "Playback rate");
    ratePopover.appendChild(ratePopoverRow);
    ratePopover.appendChild(rateSlider);

    rateWrap.appendChild(rateButton);
    rateWrap.appendChild(ratePopover);

    const volumeWrap = createElement("div", "ap-volume");
    const muteBtn = createElement("button", "ap-btn ap-mute");
    muteBtn.type = "button";
    muteBtn.setAttribute("aria-label", "Mute");
    muteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="ap-icon ap-icon-volume" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
      </svg>
      <svg viewBox="0 0 24 24" class="ap-icon ap-icon-muted" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
      </svg>
    `;
    const volumeSlider = createElement("input", "ap-volume-slider");
    volumeSlider.type = "range";
    volumeSlider.min = "0";
    volumeSlider.max = "100";
    volumeSlider.step = "1";
    volumeSlider.setAttribute("aria-label", "Volume");
    const volumeValue = createElement("span", "ap-volume-value", "70");
    volumeWrap.appendChild(muteBtn);
    volumeWrap.appendChild(volumeSlider);
    volumeWrap.appendChild(volumeValue);

    const downloadBtn = createElement("button", "ap-btn ap-download");
    downloadBtn.type = "button";
    downloadBtn.setAttribute("aria-label", "Download audio");
    downloadBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="ap-icon ap-icon-download" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    `;

    controls.appendChild(playBtn);
    controls.appendChild(rewindBtn);
    controls.appendChild(forwardBtn);
    controls.appendChild(rateWrap);
    controls.appendChild(volumeWrap);
    controls.appendChild(downloadBtn);

    const progressWrap = createElement("div", "ap-progress");
    const timeRow = createElement("div", "ap-time");
    const currentTime = createElement("span", "ap-current", "0:00");
    const separator = createElement("span", "ap-separator", "/");
    const duration = createElement("span", "ap-duration", "0:00");
    timeRow.appendChild(currentTime);
    timeRow.appendChild(separator);
    timeRow.appendChild(duration);

    const progressRange = createElement("input", "ap-progress-range");
    progressRange.type = "range";
    progressRange.min = "0";
    progressRange.max = "0";
    progressRange.step = "0.01";
    progressRange.value = "0";
    progressRange.setAttribute("aria-label", "Seek");

    progressWrap.appendChild(timeRow);
    progressWrap.appendChild(progressRange);

    const audio = createElement("audio", "ap-audio");
    audio.preload = "metadata";

    root.appendChild(titleRow);
    root.appendChild(controls);
    root.appendChild(progressWrap);
    root.appendChild(audio);

    this._container.appendChild(root);

    this._dom = {
      titleRow,
      controls,
      root,
      title,
      playBtn,
      rewindBtn,
      forwardBtn,
      rateWrap,
      rateButton,
      rateValue,
      ratePopover,
      ratePopoverValue,
      rateSlider,
      muteBtn,
      volumeSlider,
      volumeValue,
      downloadBtn,
      currentTime,
      duration,
      progressRange,
      timeRow,
    };

    this._audio = audio;
  }

  _bindUI() {
    const { playBtn, rewindBtn, forwardBtn, rateButton, rateSlider } = this._dom;
    const { muteBtn, volumeSlider, downloadBtn, progressRange } = this._dom;

    this._bind(playBtn, "click", () => this.toggle());
    this._bind(rewindBtn, "click", () => this.seekBy(-this._options.seekStep));
    this._bind(forwardBtn, "click", () => this.seekBy(this._options.seekStep));
    this._bind(rateButton, "click", (event) => {
      event.stopPropagation();
      this._toggleRatePopover();
    });
    this._bind(rateSlider, "input", (event) => {
      this._handleRateInput(event.target.value);
      this._emitOptionsChange(["playbackRate"]);
    });
    this._bind(rateSlider, "keydown", (event) => {
      if (event.key === "Escape") {
        this._closeRatePopover();
      }
    });
    this._bind(document, "click", (event) => {
      if (!this._dom.rateWrap.contains(event.target)) {
        this._closeRatePopover();
      }
    });
    this._bind(muteBtn, "click", () => {
      this.toggleMute();
      this._emitOptionsChange(["muted"]);
    });
    this._bind(volumeSlider, "input", (event) => {
      this.setVolume(event.target.value);
      this._emitOptionsChange(["volume"]);
    });
    this._bind(downloadBtn, "click", () => this._handleDownload());
    this._bind(progressRange, "input", (event) =>
      this.seek(Number(event.target.value))
    );
    this._bind(progressRange, "keydown", (event) =>
      this._handleSeekKeys(event)
    );

    this._bind(this._audio, "loadedmetadata", () => {
      // Some browsers may reset these after new src load.
      this._audio.playbackRate = this._options.playbackRate;
      this._audio.volume = this._options.volume / 100;
      this._audio.muted = this._options.muted;
      this._updateRateUI();
      this._updateVolumeUI(true);
      this._updateDuration();
      this.emit("ready", {
        duration: this._audio.duration,
        src: this._audio.src,
      });
    });

    this._bind(this._audio, "timeupdate", () => this._handleTimeUpdate());
    this._bind(this._audio, "play", () => {
      this._updatePlayState();
      this._startProgressLoop();
      this.emit("play");
    });
    this._bind(this._audio, "pause", () => {
      this._updatePlayState();
      this._stopProgressLoop();
      this.emit("pause");
    });
    this._bind(this._audio, "ended", () => {
      this._updatePlayState();
      this._syncProgress(this._audio.duration);
      this._stopProgressLoop();
      this.emit("ended");
    });
    this._bind(this._audio, "ratechange", () => {
      this._updateRateUI();
      this.emit("ratechange", { rate: this._audio.playbackRate });
    });
    this._bind(this._audio, "volumechange", () => {
      this._updateVolumeUI();
    });
    this._bind(this._audio, "error", () => {
      const error = this._audio.error;
      this.emit("error", { error });
    });
  }

  _bind(el, event, handler, options) {
    el.addEventListener(event, handler, options);
    this._listeners.push({ el, event, handler, options });
  }

  _applyOptions() {
    this._updateRateOptions();
    this._audio.playbackRate = this._options.playbackRate;
    this._updateRateUI();

    this._audio.volume = this._options.volume / 100;
    this._audio.muted = this._options.muted;
    this._updateVolumeUI(true);

    this._syncDownloadState();
    this._updateSeekLabels();

    this._dom.root.setAttribute("data-theme", this._options.theme);
    this._dom.root.setAttribute("aria-label", this._options.ariaLabelPrefix);
    this._dom.timeRow.classList.toggle(
      "ap-hidden",
      !this._options.showTime
    );

    if (this._options.src) {
      const currentSrc = this._audio.getAttribute("src") || "";
      if (currentSrc !== this._options.src) {
        this._audio.src = this._options.src;
      }
    }
    this._updateTitle();
  }

  _updateSeekStepLabels(buttonElement, label) {
    buttonElement.setAttribute(
      "aria-label",
      `${label} ${this._options.seekStep} seconds`
    );
    const tspan = buttonElement.querySelector("tspan");
    tspan.textContent = this._options.seekStep;
    tspan.parentElement.setAttribute(
      "data-num",
      this._options.seekStep
    );
  }

  _updateSeekLabels() {
    this._updateSeekStepLabels(this._dom.rewindBtn, "Rewind");
    this._updateSeekStepLabels(this._dom.forwardBtn, "Forward");
  }

  _updateTitle() {
    const title = this._meta.title || "";
    this._dom.title.textContent = title;
    this._dom.title.classList.toggle("ap-hidden", !title);
  }

  _updateRateOptions() {
    const { rateSlider } = this._dom;
    const step = this._options.playbackRateStep;
    rateSlider.min = String(this._options.playbackRateMin);
    rateSlider.max = String(this._options.playbackRateMax);
    rateSlider.step = String(step);
  }

  _updateRateUI() {
    const { rateValue, ratePopoverValue, rateSlider } = this._dom;
    const rate = this._audio.playbackRate || this._options.playbackRate;
    this._options.playbackRate = rate;
    rateValue.textContent = formatRate(rate);
    ratePopoverValue.textContent = formatRate(rate);
    rateSlider.value = String(rate);
  }

  _handleRateInput(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return;
    this.setPlaybackRate(raw);
    this._dom.rateSlider.value = String(raw);
  }

  _toggleRatePopover() {
    if (this._dom.rateWrap.classList.contains("ap-open")) {
      this._closeRatePopover();
    } else {
      this._openRatePopover();
    }
  }

  _openRatePopover() {
    this._dom.rateWrap.classList.add("ap-open");
    this._dom.rateButton.setAttribute("aria-expanded", "true");
    this._dom.rateSlider.focus();
  }

  _closeRatePopover() {
    if (!this._dom.rateWrap.classList.contains("ap-open")) return;
    this._dom.rateWrap.classList.remove("ap-open");
    this._dom.rateButton.setAttribute("aria-expanded", "false");
  }

  _updateVolumeUI(skipEmit = false) {
    const volume = Math.round(this._audio.volume * 100);
    const muted = this._audio.muted;
    this._dom.volumeSlider.value = String(volume);
    this._dom.volumeValue.textContent = String(volume);
    this._dom.root.classList.toggle("ap-muted", muted);
    this._dom.muteBtn.setAttribute(
      "aria-label",
      muted ? "Unmute" : "Mute"
    );

    if (!skipEmit) {
      if (volume !== this._options.volume) {
        this._options.volume = volume;
        this.emit("volumechange", { volume });
      }
      if (muted !== this._options.muted) {
        this._options.muted = muted;
        this.emit("mutechange", { muted });
      }
    }
  }

  _updatePlayState() {
    const isPlaying = !this._audio.paused;
    this._dom.root.classList.toggle("ap-playing", isPlaying);
    this._dom.playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  }

  _handleSeekKeys(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.seekBy(-this._options.seekStep);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      this.seekBy(this._options.seekStep);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.seek(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.seek(this._audio.duration);
    }
  }

  _updateDuration() {
    const duration = this._audio.duration;
    this._dom.duration.textContent = formatTime(duration);
    this._dom.progressRange.max = Number.isFinite(duration)
      ? String(duration)
      : "0";
  }

  _syncProgress(currentTime) {
    const current = Number.isFinite(currentTime)
      ? currentTime
      : this._audio.currentTime;
    this._dom.currentTime.textContent = formatTime(current);
    this._dom.progressRange.value = String(current);
  }

  _handleTimeUpdate() {
    const now = Date.now();
    if (now - this._lastTimeEmit < 200) return;
    this._lastTimeEmit = now;

    const current = this._audio.currentTime;
    const duration = this._audio.duration;

    // Keep aria/time labels throttled; slider is updated by RAF loop.
    this._dom.currentTime.textContent = formatTime(current);

    this.emit("timeupdate", { currentTime: current, duration });
  }

  _startProgressLoop() {
    if (this._rafId) return;
    const tick = () => {
      if (!this._audio || this._audio.paused || this._destroyed) {
        this._rafId = null;
        return;
      }
      this._syncProgress();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _stopProgressLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _syncDownloadState() {
    const allow =
      typeof this._meta.allowDownload === "boolean"
        ? this._meta.allowDownload
        : this._options.allowDownload;
    this._dom.downloadBtn.disabled = !allow;
    this._dom.downloadBtn.classList.toggle("ap-hidden", !allow);
  }

  _handleDownload() {
    const src = this._audio.src;
    if (!src) return;
    const filename =
      this._meta.filename || this._options.downloadFilename || "";
    this.emit("download", { src, filename });

    const link = document.createElement("a");
    link.target = "_blank";
    link.href = src;
    if (filename) link.download = filename;
    link.rel = "noopener";
    link.click();
  }

  _emitOptionsChange(changedKeys) {
    if (!Array.isArray(changedKeys) || !changedKeys.length) return;
    this.emit("optionschange", {
      changedKeys,
      options: this._getLiveOptions(),
    });
  }
}

export default AudioPlayer;
