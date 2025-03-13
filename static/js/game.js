// build/game.js
var Game;
(function(Game2) {
  const DefaultDirectionWeights = [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1]
  ];
  const DefaultForbiddenTurns = {
    NE: /* @__PURE__ */ new Set(["S", "W", "SW"]),
    NW: /* @__PURE__ */ new Set(["S", "E", "SE"]),
    SE: /* @__PURE__ */ new Set(["N", "W", "NW"]),
    SW: /* @__PURE__ */ new Set(["N", "E", "NE"]),
    N: /* @__PURE__ */ new Set(["SW", "SE", "S"]),
    E: /* @__PURE__ */ new Set(["NW", "SW", "W"]),
    S: /* @__PURE__ */ new Set(["NE", "NW", "N"]),
    W: /* @__PURE__ */ new Set(["NE", "SE", "E"])
  };
  let AnimationStyle;
  (function(AnimationStyle2) {
    AnimationStyle2[AnimationStyle2["Fluid"] = 0] = "Fluid";
    AnimationStyle2[AnimationStyle2["Step"] = 1] = "Step";
    AnimationStyle2[AnimationStyle2["Path"] = 2] = "Path";
  })(AnimationStyle || (AnimationStyle = {}));
  let State;
  (function(State2) {
    State2[State2["None"] = 0] = "None";
    State2[State2["Splash"] = 1] = "Splash";
    State2[State2["Play"] = 2] = "Play";
    State2[State2["Countdown"] = 3] = "Countdown";
    State2[State2["AnimatePath"] = 4] = "AnimatePath";
    State2[State2["Paused"] = 5] = "Paused";
    State2[State2["Help"] = 6] = "Help";
    State2[State2["Wrong"] = 7] = "Wrong";
    State2[State2["Won"] = 8] = "Won";
    State2[State2["Start"] = 9] = "Start";
    State2[State2["Lost"] = 10] = "Lost";
  })(State || (State = {}));
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  class TracerGame extends HTMLElement {
    constructor() {
      super();
      this._state = State.None;
      this.lastTapTime = 0;
      this._soundEnabled = true;
      this.sounds = {};
      this.path = [];
      this.pathIndex = 0;
      this.elapsed = 0;
      this.prelude = true;
      this._creatingPath = false;
    }
    connectedCallback() {
      this.shadow = this.attachShadow({ mode: "open" });
      this.dynamicStyles = document.createElement("style");
      const styles = document.createElement("style");
      styles.textContent = `
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    touch-action: manipulation;
    font-size: calc(var(--cell-size) / 2);
}
#board {
    position: relative;
    margin: 0 auto;
    width: fit-content;
    display: grid;
    grid-template-columns: repeat(var(--tiles-per-row), var(--cell-size));
    grid-template-rows: repeat(--tiles-per-col, var(--cell-size));
    gap: calc(var(--cell-size) / 10);
}
#board.locked > div.tile {
    cursor: not-allowed;
}
#board.wrong > div.tile {
    background-color: var(--wrong-color);
    box-shadow: 0 0 calc(var(--cell-size) / 10) calc(var(--cell-size) / 30) var(--wrong-color);
    cursor: not-allowed;
}
#board.go > div.tile.path {
    background-color: var(--go-color);
    box-shadow: 0 0 calc(var(--cell-size) / 10) calc(var(--cell-size) / 30) var(--go-color);
}
.tile {
    display: block;
    box-sizing: content-box;
    width: var(--cell-size);
    height: var(--cell-size);
    background-color: var(--tile-color);
    border-radius: calc(var(--cell-size) / 30);
    cursor: pointer;
    text-align: center;
    line-height: var(--cell-size);
    transition: background-color 60ms, box-shadow 60ms;
}
.tile.path {
    animation-name: path;
    animation-iteration-count: 1;
    animation-fill-mode: alternate;
    animation-timing-function: cubic-bezier(.32,.36,.04,.96);
}
.tile.step {
    background-color: var(--path-color);
    box-shadow: 0 0 calc(var(--cell-size) / 7) calc(var(--cell-size) / 30) var(--path-color);
}
.tile.visited {
    background-color: var(--visited-color);
    box-shadow: 0 0 calc(var(--cell-size) / 6) calc(var(--cell-size) / 30) var(--visited-color);
}
@keyframes path {
    0% {
        background-color: var(--tile-color);
    }
    50% {
        background-color: var(--path-color);
        box-shadow: 0 0 calc(var(--cell-size) / 7) calc(var(--cell-size) / 30) var(--path-color);
    }
}`;
      this.board = document.createElement("div");
      this.board.classList.add("locked");
      this.board.id = "board";
      this.shadow.appendChild(this.board);
      this.shadow.appendChild(this.dynamicStyles);
      this.shadow.appendChild(styles);
      this.activateEventListeners();
      this.initWorker();
      this.initAudio();
    }
    initWorker() {
      this.worker = new Worker(`./static/js/worker.js?v=${Date.now()}`, { type: "module" });
      this.worker.onmessage = (e) => {
        var _a;
        const { dt, numTries, path } = e.data;
        this._creatingPath = false;
        this.path = path;
        (_a = this.pathReadyCallback) === null || _a === void 0 ? void 0 : _a.call(path);
        console.info(`New path with ${path.length} steps created in ${dt}ms after ${numTries} tries: ${path.map(({ x, y }) => `(${x},${y})`).join(" \u2192 ")}`);
      };
      this.worker.onerror = (e) => {
        console.error(e);
      };
      this.worker.onmessageerror = (e) => {
        console.error(e);
      };
    }
    updateDynamicStyles() {
      this.dynamicStyles.textContent = `
:host {
    --cell-size: ${80 / Math.max(this.level.width, this.level.height)}vmin;
    --tiles-per-row: ${this.level.width};
    --tiles-per-col: ${this.level.height};
}
.tile.path {
    animation-duration: ${this.level.tileAnimationDurationSecs}s;
}
`;
    }
    get levelCount() {
      return TracerGame.Levels.length;
    }
    adjustSize() {
      this.updateDynamicStyles();
    }
    buildBoard() {
      this.tiles = Array.from({ length: this.level.height }, () => Array(this.level.width).fill(null));
      for (let y = 0; y < this.level.height; ++y) {
        for (let x = 0; x < this.level.width; ++x) {
          const tile = document.createElement("div");
          tile.classList.add("tile");
          tile.dataset.x = x.toString();
          tile.dataset.y = y.toString();
          this.tiles[y][x] = tile;
        }
      }
      this.board.addEventListener("click", (e) => {
        if (e.target.classList.contains("tile")) {
          this.onTileClick(e);
        }
      });
      this.board.replaceChildren(...this.tiles.flat());
    }
    set difficulty(difficulty) {
      var _a;
      if (difficulty === this.difficulty && this.path.length > 0) {
        (_a = this.pathReadyCallback) === null || _a === void 0 ? void 0 : _a.call(this, this.path);
        return;
      }
      this.level = TracerGame.Levels[Math.min(difficulty, TracerGame.Levels.length - 1)];
      this.updateDynamicStyles();
      this.buildBoard();
      this.createPath();
    }
    get difficulty() {
      return Math.max(0, TracerGame.Levels.indexOf(this.level));
    }
    get creatingPath() {
      return this._creatingPath;
    }
    animatePath() {
      switch (this.level.animationStyle) {
        case AnimationStyle.Fluid:
          const delayFactor = this.level.tileAnimationDurationSecs / (this.path.length * 3);
          this.path.forEach(({ x, y }, i) => {
            const tile = this.tiles[y][x];
            tile.classList.add("path");
            tile.style.animationDelay = `${i * delayFactor}s`;
          });
          break;
        case AnimationStyle.Path:
          const delaySecs = this.level.tileAnimationDurationSecs / this.path.length;
          this.path.forEach(({ x, y }, i) => {
            setTimeout(() => {
              this.tiles[y][x].classList.add("step");
            }, 1e3 * i * delaySecs);
          });
          break;
        case AnimationStyle.Step:
          this.path.forEach(({ x, y }, i) => {
            delay(1e3 * i * this.level.tileAnimationDurationSecs / this.path.length).then(() => {
              this.tiles[y][x].classList.add("step");
              delay(1e3 * this.level.tileAnimationDurationSecs / this.path.length).then(() => {
                this.tiles[y][x].classList.remove("step");
              });
            });
          });
          break;
      }
    }
    createPath() {
      if (this._creatingPath)
        return;
      const levelData = {
        width: this.level.width,
        height: this.level.height,
        numStepsRequired: this.level.numStepsRequired,
        directionWeights: this.level.directionWeights,
        forbiddenTurns: this.level.forbiddenTurns,
        crossingAllowed: this.level.crossingAllowed
      };
      this._creatingPath = true;
      this.worker.postMessage(levelData);
    }
    registerPathReadyCallback(callback) {
      this.pathReadyCallback = callback;
    }
    unregisterPathReadyCallback() {
      this.pathReadyCallback = void 0;
    }
    activateEventListeners() {
      addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
      addEventListener("touchend", (e) => this.onTouchEnd(e));
      addEventListener("resize", () => this.adjustSize());
    }
    newGame() {
      this.prelude = true;
      this.state = State.Start;
    }
    update() {
      if (this.prelude || ![State.AnimatePath, State.Play, State.Wrong].includes(this._state))
        return;
      this.elapsed = 1e-3 * (performance.now() - this.t0);
      dispatchEvent(new CustomEvent("countdown", {
        detail: Math.max(0, this.level.secsToSolve - this.elapsed).toFixed(2)
      }));
      if (this.elapsed > this.level.secsToSolve) {
        this.state = State.Lost;
      }
      this.animationFrameID = requestAnimationFrame(() => this.update());
    }
    set state(state) {
      if (this._state === state)
        return;
      this._state = state;
      switch (state) {
        case State.Start:
          this.elapsed = 0;
          this.state = State.Countdown;
          dispatchEvent(new CustomEvent("countdown", {
            detail: this.level.secsToSolve.toFixed(2)
          }));
          break;
        case State.Countdown:
          this.playSound("countdown");
          dispatchEvent(new CustomEvent("showcountdown"));
          delay(1400).then(() => {
            this.state = State.AnimatePath;
          });
          break;
        case State.AnimatePath:
          this.board.classList.remove("go");
          this.pathIndex = 0;
          this.animatePath();
          delay(1e3 * this.level.tileAnimationDurationSecs).then(() => {
            this.state = State.Play;
            this.animationFrameID = requestAnimationFrame(() => this.update());
          });
          break;
        case State.Play:
          this.playSound("pip");
          this.board.classList.remove("locked");
          this.board.classList.add("go");
          delay(100).then(() => {
            this.board.classList.remove("go");
            this.tiles.flat().forEach((tile) => tile.classList.remove("path", "step"));
          });
          this.t0 = performance.now() - 1e3 * this.elapsed;
          this.animationFrameID = requestAnimationFrame(() => this.update());
          this.prelude = false;
          break;
        case State.Wrong:
          this.playSound("alarm");
          this.board.classList.add("wrong");
          this.tiles.flat().forEach((tile) => tile.classList.remove("visited"));
          delay(1e3 * this.sounds["alarm"].buffer.duration).then(() => {
            this.board.classList.remove("wrong");
            const elapsed = 1e-3 * (performance.now() - this.t0);
            if (elapsed < this.level.secsToSolve) {
              this.state = State.Countdown;
            }
          });
          this.animationFrameID = requestAnimationFrame(() => this.update());
          break;
        case State.Paused:
          this.board.classList.add("locked");
          dispatchEvent(new CustomEvent("pause"));
          cancelAnimationFrame(this.animationFrameID);
          break;
        case State.Won:
          cancelAnimationFrame(this.animationFrameID);
          this.board.classList.add("locked");
          this.playSound("tada");
          this.tiles.flat().forEach((tile) => tile.classList.remove("visited"));
          this.createPath();
          dispatchEvent(new CustomEvent("wonlevel"));
          this.elapsed = 0;
          break;
        case State.Lost:
          clearTimeout(this.timeoutID);
          cancelAnimationFrame(this.animationFrameID);
          this.stopAllSounds();
          this.playSound("alarm");
          this.board.classList.remove("wrong");
          this.tiles.flat().forEach((tile) => tile.classList.remove("visited", "path", "step"));
          this.createPath();
          dispatchEvent(new CustomEvent("lostlevel"));
          break;
        case State.Splash:
          el.countdown.textContent = this.level.secsToSolve.toFixed(2);
          break;
        default:
          break;
      }
    }
    get state() {
      return this._state;
    }
    onTileClick(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this._state !== State.Play)
        return;
      const target = e.target;
      const x = parseInt(target.dataset.x);
      const y = parseInt(target.dataset.y);
      const tile = this.tiles[y][x];
      const wantedTile = this.path[this.pathIndex];
      if (wantedTile.x === x && wantedTile.y === y) {
        this.playSound("step");
        tile.classList.add("visited");
        ++this.pathIndex;
        if (this.pathIndex === this.path.length) {
          this.state = State.Won;
        }
      } else {
        this.state = State.Wrong;
      }
    }
    onTouchStart(_e) {
      this.touchStartTime = performance.now();
    }
    onTouchEnd(e) {
      const currentTime = performance.now();
      const touchDuration = currentTime - this.touchStartTime;
      if (touchDuration < 400) {
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target.classList.contains("tile")) {
          const mouseEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: touch.clientX,
            clientY: touch.clientY
          });
          const syntheticEvent = Object.create(mouseEvent, {
            target: { value: target },
            currentTarget: { value: target }
          });
          this.onTileClick(syntheticEvent);
        }
      }
      const tapLength = currentTime - this.lastTapTime;
      if (tapLength < 500 && tapLength > 0) {
        e.preventDefault();
      }
      this.lastTapTime = currentTime;
    }
    set soundEnabled(enabled) {
      this._soundEnabled = enabled;
      localStorage.setItem("tracer-sound-enabled", this.soundEnabled.toString());
    }
    get soundEnabled() {
      return this._soundEnabled;
    }
    pause() {
      this.state = State.Paused;
    }
    unpause() {
      this.state = State.Play;
    }
    lose() {
      this.state = State.Lost;
    }
    doPlaySound(name) {
      const source = this.audioCtx.createBufferSource();
      source.buffer = this.sounds[name].buffer;
      source.connect(this.gainNode);
      source.start();
      this.sounds[name].source = source;
    }
    playSound(name) {
      if (!this.soundEnabled)
        return;
      if (this.audioCtx.state === "suspended") {
        this.resumeAudio().then(() => {
          this.doPlaySound(name);
        });
      } else {
        this.doPlaySound(name);
      }
    }
    stopSound(name) {
      if (this.sounds[name].source) {
        this.sounds[name].source.stop();
      }
    }
    stopAllSounds() {
      for (const name in this.sounds) {
        this.stopSound(name);
      }
    }
    resumeAudio() {
      return this.audioCtx.resume();
    }
    initAudio() {
      this.audioCtx = new AudioContext();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = parseFloat(localStorage.getItem("tracer-sound-volume") || TracerGame.DEFAULT_GAIN_VALUE.toString());
      this.gainNode.connect(this.audioCtx.destination);
      for (const name of ["countdown", "alarm", "step", "tada", "pip"]) {
        this.sounds[name] = {};
        fetch(`static/sounds/${name}.mp3`).then((response) => response.arrayBuffer()).then((arrayBuffer) => this.audioCtx.decodeAudioData(arrayBuffer)).then((audioBuffer) => {
          this.sounds[name].buffer = audioBuffer;
        }).catch((error) => {
          console.error("Failed to load sound:", error);
        });
      }
    }
  }
  TracerGame.DEFAULT_GAIN_VALUE = 0.5;
  TracerGame.Levels = [
    {
      crossingAllowed: false,
      directionWeights: [
        [0, 1, 0],
        [1, 0, 1],
        [0, 0, 0]
      ],
      forbiddenTurns: DefaultForbiddenTurns,
      width: 4,
      height: 4,
      secsToSolve: 20,
      tileAnimationDurationSecs: 3,
      numStepsRequired: 5,
      animationStyle: AnimationStyle.Path
    },
    {
      crossingAllowed: false,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 5,
      height: 4,
      secsToSolve: 30,
      tileAnimationDurationSecs: 3.5,
      numStepsRequired: 6,
      animationStyle: AnimationStyle.Path
    },
    {
      crossingAllowed: false,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 5,
      height: 4,
      secsToSolve: 30,
      tileAnimationDurationSecs: 3.5,
      numStepsRequired: 8,
      animationStyle: AnimationStyle.Path
    },
    {
      crossingAllowed: false,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 5,
      height: 5,
      secsToSolve: 30,
      tileAnimationDurationSecs: 3.5,
      numStepsRequired: 10,
      animationStyle: AnimationStyle.Fluid
    },
    {
      crossingAllowed: false,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 5,
      height: 6,
      secsToSolve: 30,
      tileAnimationDurationSecs: 3.5,
      numStepsRequired: 11,
      animationStyle: AnimationStyle.Fluid
    },
    {
      crossingAllowed: false,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 6,
      height: 6,
      secsToSolve: 30,
      tileAnimationDurationSecs: 3,
      numStepsRequired: 13,
      animationStyle: AnimationStyle.Fluid
    },
    {
      crossingAllowed: false,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 7,
      height: 6,
      secsToSolve: 25,
      tileAnimationDurationSecs: 2.5,
      numStepsRequired: 14,
      animationStyle: AnimationStyle.Fluid
    },
    {
      crossingAllowed: false,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 8,
      height: 7,
      secsToSolve: 20,
      tileAnimationDurationSecs: 2.5,
      numStepsRequired: 15,
      animationStyle: AnimationStyle.Fluid
    },
    {
      crossingAllowed: true,
      directionWeights: [
        [0, 1, 0],
        [1, 0, 1],
        [0, 0, 0]
      ],
      forbiddenTurns: DefaultForbiddenTurns,
      width: 9,
      height: 9,
      secsToSolve: 60,
      tileAnimationDurationSecs: 5,
      numStepsRequired: 18,
      animationStyle: AnimationStyle.Path
    },
    {
      crossingAllowed: true,
      directionWeights: DefaultDirectionWeights,
      forbiddenTurns: DefaultForbiddenTurns,
      width: 9,
      height: 9,
      secsToSolve: 60,
      tileAnimationDurationSecs: 5,
      numStepsRequired: 20,
      animationStyle: AnimationStyle.Path
    },
    {
      crossingAllowed: true,
      directionWeights: DefaultDirectionWeights,
      width: 11,
      height: 11,
      secsToSolve: 60,
      tileAnimationDurationSecs: 5,
      numStepsRequired: 25,
      animationStyle: AnimationStyle.Path
    }
  ];
  let el = {};
  const lang = document.location.hostname.startsWith("leuchtspur") ? "de" : "en";
  function onKeyUp(e) {
    switch (e.key) {
      case "Escape":
        if (el.splash.open)
          return;
        switch (el.game.state) {
          case State.Play:
            el.game.pause();
            break;
          case State.Paused:
            el.game.unpause();
            break;
          default:
            break;
        }
        break;
      case "x":
        el.game.lose();
        break;
      default:
        break;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function addDifficultyTemplate(parent, lang2) {
    const difficultyButtons = [];
    const startGame = (difficulty) => {
      const doStartGame = () => {
        parent.close();
        difficultyButtons[el.game.difficulty].disabled = false;
        el.game.newGame();
      };
      el.game.registerPathReadyCallback(function pathReadyCallback(_path) {
        if (el.game.creatingPath) {
          el.game.registerPathReadyCallback(doStartGame);
        } else {
          el.game.unregisterPathReadyCallback();
          doStartGame();
        }
      });
      el.game.resumeAudio().then(() => {
        el.game.difficulty = difficulty;
      });
    };
    const difficultyTemplate = document.querySelector(`#difficulty-template-${lang2}`).content.cloneNode(true);
    for (let i = 0; i < el.game.levelCount; ++i) {
      const button = document.createElement("button");
      button.textContent = (i + 1).toString();
      button.className = "difficulty";
      difficultyTemplate.appendChild(button);
      difficultyButtons.push(button);
    }
    parent.appendChild(difficultyTemplate);
    parent.addEventListener("toggle", () => {
      difficultyButtons[el.game.difficulty].textContent = (el.game.difficulty + 1).toString();
      difficultyButtons[el.game.difficulty].focus();
    });
    const loaderIcon = document.querySelector(`#loader-icon`).content.cloneNode(true);
    parent.addEventListener("keydown", (e) => {
      if ("1" <= e.key && e.key <= `${el.game.levelCount}`) {
        const difficulty = parseInt(e.key) - 1;
        startGame(difficulty);
        difficultyButtons[difficulty].disabled = true;
        difficultyButtons[difficulty].replaceChildren(loaderIcon);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    });
    parent.addEventListener("click", (e) => {
      if (e.target instanceof HTMLButtonElement) {
        const difficulty = parseInt(e.target.textContent || "1") - 1;
        startGame(difficulty);
        difficultyButtons[difficulty].disabled = true;
        difficultyButtons[difficulty].replaceChildren(loaderIcon);
      }
      e.stopImmediatePropagation();
      e.preventDefault();
    });
  }
  function enableSplashScreen() {
    el.splash = document.querySelector(`#splash-screen-${lang}`);
    el.splash.addEventListener("cancel", (e) => e.preventDefault());
    addDifficultyTemplate(el.splash, lang);
    return el.splash;
  }
  function enableWonDialog() {
    el.won = document.querySelector(`#won-dialog-${lang}`);
    el.won.addEventListener("cancel", (e) => e.preventDefault());
    window.addEventListener("wonlevel", (e) => {
      el.won.showModal();
    });
    addDifficultyTemplate(el.won, lang);
  }
  function enableLostDialog() {
    el.lost = document.querySelector(`#lost-dialog-${lang}`);
    el.lost.addEventListener("cancel", (e) => e.preventDefault());
    window.addEventListener("lostlevel", (e) => {
      el.lost.showModal();
    });
    addDifficultyTemplate(el.lost, lang);
  }
  function enablePauseDialog() {
    el.pause = document.querySelector(`#pause-dialog-${lang}`);
    const okButton = el.pause.querySelector("button");
    okButton.addEventListener("click", (e) => {
      el.pause.close();
      el.game.unpause();
      e.stopImmediatePropagation();
    });
    window.addEventListener("pause", (e) => {
      el.pause.showModal();
    });
  }
  function enableCountdownDialog() {
    el.countdownDialog = document.querySelector("#countdown-dialog");
    el.threeTwoOne = el.countdownDialog.querySelector("div>div");
    window.addEventListener("showcountdown", () => {
      el.countdownDialog.showModal();
      el.threeTwoOne.textContent = "3";
      el.threeTwoOne.className = "three";
      delay(416).then(() => {
        el.threeTwoOne.textContent = "2";
        el.threeTwoOne.className = "two";
        delay(416).then(() => {
          el.threeTwoOne.textContent = "1";
          el.threeTwoOne.className = "one";
          delay(416).then(() => {
            el.countdownDialog.close();
            el.threeTwoOne.className = "";
          });
        });
      });
    });
  }
  function enableSettingsDialog() {
    el.settingsDialog = document.querySelector("#settings-dialog");
    window.addEventListener("showsettings", () => {
      el.settingsDialog.showModal();
    });
  }
  function main() {
    console.info("%cTracer %cstarted.", "color: #f33; font-weight: bold", "color: initial; font-weight: normal;");
    if (!["localhost", "127.0.0.1"].includes(document.location.hostname)) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/service-worker.js").then((registration) => {
          console.info(`Service Worker registered with scope "${registration.scope}"`);
        }).catch((error) => {
          console.error(`Service Worker registration failed: ${error}`);
        });
      }
    }
    customElements.define("tracer-game", TracerGame);
    el.game = document.querySelector("tracer-game");
    el.countdown = document.querySelector("#countdown");
    addEventListener("countdown", (e) => {
      el.countdown.textContent = e.detail;
    });
    document.addEventListener("touchstart", () => el.game.resumeAudio(), { once: true });
    document.addEventListener("click", () => el.game.resumeAudio(), { once: true });
    const difficulty = parseInt(localStorage.getItem("tracer-difficulty") || "0");
    el.game.difficulty = difficulty;
    addEventListener("keyup", onKeyUp);
    enableCountdownDialog();
    enableSettingsDialog();
    enableWonDialog();
    enableLostDialog();
    enablePauseDialog();
    enableSplashScreen().showModal();
  }
  addEventListener("pageshow", main);
  addEventListener("beforeunload", () => {
    localStorage.setItem("tracer-difficulty", el.game.difficulty.toString());
  });
})(Game || (Game = {}));
