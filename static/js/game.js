var Game;
(function (Game) {
    let State;
    (function (State) {
        State[State["None"] = 0] = "None";
        State[State["Splash"] = 1] = "Splash";
        State[State["Play"] = 2] = "Play";
        State[State["Countdown"] = 3] = "Countdown";
        State[State["AnimatePath"] = 4] = "AnimatePath";
        State[State["Paused"] = 5] = "Paused";
        State[State["Help"] = 6] = "Help";
        State[State["Wrong"] = 7] = "Wrong";
        State[State["Won"] = 8] = "Won";
        State[State["Lost"] = 9] = "Lost";
        State[State["Start"] = 10] = "Start";
    })(State || (State = {}));
    const DirectionDelta = {
        N: { dx: 0, dy: -1 },
        S: { dx: 0, dy: 1 },
        E: { dx: 1, dy: 0 },
        W: { dx: -1, dy: 0 },
        NE: { dx: 1, dy: -1 },
        NW: { dx: -1, dy: -1 },
        SE: { dx: 1, dy: 1 },
        SW: { dx: -1, dy: 1 },
    };
    Object.freeze(DirectionDelta);
    const DirectionLookup = {};
    Object.keys(DirectionDelta).forEach(key => {
        const dir = DirectionDelta[key];
        DirectionLookup[`${dir.dx},${dir.dy}`] = key;
    });
    Object.freeze(DirectionLookup);
    const ProbTableTurns = { NE: 7, E: 6, SE: 5, S: 4, SW: 3, W: 2, NW: 1, N: 0 };
    Object.freeze(ProbTableTurns);
    const DefaultDirectionProbs = [
        [0.16, 0.42, 0.16],
        [0.08, 0.00, 0.08],
        [0.00, 0.00, 0.00],
    ];
    const DefaultForbiddenTurns = {
        NE: ["S", "W", "SW"],
        NW: ["S", "E", "SE"],
        SE: ["N", "W", "NW"],
        SW: ["N", "E", "NE"],
        N: ["SW", "SE", "S"],
        E: ["NW", "SW", "W"],
        S: ["NE", "NW", "N"],
        W: ["NE", "SE", "E"],
    };
    function delay(ms) {
        return new Promise(resolve => this.timeoutID = setTimeout(resolve, ms));
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
            this.t0 = performance.now();
            this.elapsed = 0;
            this.prelude = true;
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
    background-color: var(--wrong-color) !important;
    box-shadow: 0 0 calc(var(--cell-size) / 10) calc(var(--cell-size) / 30) var(--wrong-color) !important;
    cursor: not-allowed;
}
#board.go > div.tile.path {
    background-color: var(--go-color);
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
            this.initAudio();
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
        setDifficulty(difficulty) {
            this.level = TracerGame.Levels[difficulty];
            this.updateDynamicStyles();
            this.buildBoard();
            this.createPath();
        }
        get difficulty() {
            return Math.max(0, TracerGame.Levels.indexOf(this.level));
        }
        static rotateCW(matrix, eightsTurns = 1) {
            const result = Array.from({ length: 3 }, () => Array(3).fill(0));
            result[1][1] = matrix[1][1];
            for (let turn = 0; turn < eightsTurns; ++turn) {
                result[0][2] = matrix[0][1];
                result[0][1] = matrix[0][0];
                result[2][0] = matrix[2][1];
                result[2][1] = matrix[2][2];
                result[2][2] = matrix[1][2];
                result[1][2] = matrix[0][2];
                result[0][0] = matrix[1][0];
                result[1][0] = matrix[2][0];
                matrix = result.map(row => row.slice());
            }
            return matrix;
        }
        animatePath() {
            const delayFactor = this.level.tileAnimationDurationSecs / (this.path.length * 3);
            this.path.forEach(({ x, y }, i) => {
                const tile = this.tiles[y][x];
                tile.classList.add("path");
                tile.style.animationDelay = `${i * delayFactor}s`;
            });
        }
        createPath() {
            const t0 = performance.now();
            let path;
            let current;
            let turnCount;
            let numTries = 0;
            do {
                ++numTries;
                if (numTries > 5000) {
                    console.error("Failed to create path after 5000 tries");
                    return;
                }
                path = [];
                const visited = Array.from({ length: this.level.height }, () => Array(this.level.width).fill(false));
                current = {
                    x: Math.floor(Math.random() * this.level.width),
                    y: this.level.height - 1,
                };
                visited[current.y][current.x] = true;
                path.push({ ...current });
                let currentDirection = "N";
                turnCount = 0;
                while (current.y > 0 && turnCount < this.level.numTurnsRequired) {
                    const allDestinations = Object.values(DirectionDelta).map(direction => {
                        return { x: current.x + direction.dx, y: current.y + direction.dy };
                    });
                    const possibleDestinations = allDestinations
                        .filter(dst => dst.x >= 0 && dst.x < this.level.width &&
                        dst.y >= 0 && dst.y < this.level.height)
                        .filter(dst => !visited[dst.y][dst.x]);
                    const validDestinations = this.level.crossingAllowed
                        ? possibleDestinations
                        : possibleDestinations.filter(move => {
                            const dx = move.x - current.x;
                            const dy = move.y - current.y;
                            if (dx !== 0 && dy !== 0) {
                                const corner1 = { x: current.x, y: move.y };
                                const corner2 = { x: move.x, y: current.y };
                                if (visited[corner1.y][corner1.x] && visited[corner2.y][corner2.x]) {
                                    return false;
                                }
                            }
                            return true;
                        });
                    let probs = TracerGame.rotateCW(this.level.directionProbs.map(row => row.slice()), ProbTableTurns[currentDirection]);
                    const totalProbability = validDestinations.reduce((sum, move) => {
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        return sum + probs[dy + 1][dx + 1];
                    }, 0);
                    if (totalProbability === 0 || validDestinations.length === 0)
                        break;
                    const randomNumber = Math.random() * totalProbability;
                    let cumulativeProbability = 0;
                    let nextDirection;
                    for (const move of validDestinations) {
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        const prob = probs[dy + 1][dx + 1];
                        cumulativeProbability += prob;
                        if (randomNumber >= cumulativeProbability)
                            continue;
                        nextDirection = DirectionLookup[`${dx},${dy}`];
                        if (this.level.forbiddenTurns &&
                            Array.isArray(this.level.forbiddenTurns[currentDirection]) &&
                            this.level.forbiddenTurns[currentDirection].includes(nextDirection)) {
                            cumulativeProbability -= prob;
                            continue;
                        }
                        visited[move.y][move.x] = true;
                        break;
                    }
                    current = { x: current.x + DirectionDelta[nextDirection].dx, y: current.y + DirectionDelta[nextDirection].dy };
                    path.push({ ...current });
                    turnCount += currentDirection !== nextDirection ? 1 : 0;
                    currentDirection = nextDirection;
                }
            } while (turnCount !== this.level.numTurnsRequired || current.y !== 0);
            this.path = path;
            console.debug(`New path created in ${performance.now() - t0}ms after ${numTries} tries: ${path.map(({ x, y }) => `(${x},${y})`).join(" → ")}`);
        }
        activateEventListeners() {
            addEventListener("touchstart", e => this.onTouchStart(e), { passive: false });
            addEventListener("touchend", e => this.onTouchEnd(e));
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
                detail: Math.max(0, this.level.secsToSolve - this.elapsed).toFixed(2),
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
                        detail: this.level.secsToSolve.toFixed(2),
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
                        this.tiles.flat().forEach(tile => tile.classList.remove("path"));
                    });
                    this.t0 = performance.now() - 1e3 * this.elapsed;
                    this.animationFrameID = requestAnimationFrame(() => this.update());
                    this.prelude = false;
                    break;
                case State.Wrong:
                    this.playSound("alarm");
                    this.board.classList.add("wrong");
                    this.tiles.flat().forEach(tile => tile.classList.remove("visited"));
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
                    this.board.classList.add("locked");
                    this.playSound("tada");
                    this.tiles.flat().forEach(tile => tile.classList.remove("visited"));
                    this.createPath();
                    dispatchEvent(new CustomEvent("wonlevel"));
                    cancelAnimationFrame(this.animationFrameID);
                    this.elapsed = 0;
                    break;
                case State.Lost:
                    this.stopAllSounds();
                    this.playSound("alarm");
                    this.board.classList.remove("wrong");
                    this.tiles.flat().forEach(tile => tile.classList.remove("visited", "path"));
                    this.createPath();
                    dispatchEvent(new CustomEvent("lostlevel"));
                    clearTimeout(this.timeoutID);
                    cancelAnimationFrame(this.animationFrameID);
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
            }
            else {
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
                    const mouseEvent = new MouseEvent('click', {
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
            }
            else {
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
                fetch(`static/sounds/${name}.mp3`)
                    .then(response => response.arrayBuffer())
                    .then(arrayBuffer => this.audioCtx.decodeAudioData(arrayBuffer))
                    .then(audioBuffer => {
                    this.sounds[name].buffer = audioBuffer;
                })
                    .catch(error => {
                    console.error("Failed to load sound:", error);
                });
            }
        }
    }
    TracerGame.DEFAULT_GAIN_VALUE = 0.5;
    TracerGame.Levels = [
        {
            crossingAllowed: false,
            directionProbs: DefaultDirectionProbs,
            forbiddenTurns: DefaultForbiddenTurns,
            width: 4,
            height: 4,
            secsToSolve: 20,
            tileAnimationDurationSecs: 3,
            numTurnsRequired: 2,
        },
        {
            crossingAllowed: false,
            directionProbs: DefaultDirectionProbs,
            forbiddenTurns: DefaultForbiddenTurns,
            width: 5,
            height: 4,
            secsToSolve: 30,
            tileAnimationDurationSecs: 2.5,
            numTurnsRequired: 4,
        },
        {
            crossingAllowed: false,
            directionProbs: DefaultDirectionProbs,
            forbiddenTurns: DefaultForbiddenTurns,
            width: 5,
            height: 5,
            secsToSolve: 30,
            tileAnimationDurationSecs: 2.5,
            numTurnsRequired: 3,
        },
        {
            crossingAllowed: false,
            directionProbs: DefaultDirectionProbs,
            forbiddenTurns: DefaultForbiddenTurns,
            width: 5,
            height: 5,
            secsToSolve: 30,
            tileAnimationDurationSecs: 2.3,
            numTurnsRequired: 5,
        },
        {
            crossingAllowed: false,
            directionProbs: DefaultDirectionProbs,
            forbiddenTurns: DefaultForbiddenTurns,
            width: 5,
            height: 6,
            secsToSolve: 30,
            tileAnimationDurationSecs: 2.2,
            numTurnsRequired: 5,
        },
        {
            crossingAllowed: false,
            directionProbs: DefaultDirectionProbs,
            forbiddenTurns: DefaultForbiddenTurns,
            width: 6,
            height: 6,
            secsToSolve: 30,
            tileAnimationDurationSecs: 3,
            numTurnsRequired: 6,
        },
        {
            crossingAllowed: false,
            directionProbs: DefaultDirectionProbs,
            forbiddenTurns: DefaultForbiddenTurns,
            width: 7,
            height: 6,
            secsToSolve: 30,
            tileAnimationDurationSecs: 2.5,
            numTurnsRequired: 7,
        },
    ];
    let el = {};
    const lang = document.location.hostname.startsWith("leuchtspur")
        ? "de"
        : "en";
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
            default:
                break;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
    }
    function addDifficultyTemplate(parent, lang) {
        const startGame = (difficulty) => {
            parent.close();
            el.game.resumeAudio()
                .then(() => {
                el.game.setDifficulty(difficulty);
                el.game.newGame();
            });
        };
        const template = document.querySelector(`#difficulty-template-${lang}`).content.cloneNode(true);
        for (let i = 0; i < el.game.levelCount; ++i) {
            const button = document.createElement("button");
            button.textContent = (i + 1).toString();
            template.appendChild(button);
        }
        parent.appendChild(template);
        parent.addEventListener("toggle", e => {
            parent.querySelectorAll(`button`)[el.game.difficulty].focus();
        });
        parent.addEventListener("keydown", e => {
            if ("1" <= e.key && e.key <= `${el.game.levelCount}`) {
                parent.close();
                const difficulty = parseInt(e.key) - 1;
                startGame(difficulty);
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        });
        parent.addEventListener("click", e => {
            if (e.target instanceof HTMLButtonElement) {
                parent.close();
                const difficulty = parseInt(e.target.textContent) - 1;
                startGame(difficulty);
            }
            e.stopImmediatePropagation();
            e.preventDefault();
        });
    }
    function enableSplashScreen() {
        el.splash = document.querySelector(`#splash-screen-${lang}`);
        el.splash.addEventListener("cancel", e => e.preventDefault());
        addDifficultyTemplate(el.splash, lang);
        return el.splash;
    }
    function enableWonDialog() {
        el.won = document.querySelector(`#won-dialog-${lang}`);
        el.won.addEventListener("cancel", e => e.preventDefault());
        window.addEventListener("wonlevel", e => {
            el.won.showModal();
        });
        addDifficultyTemplate(el.won, lang);
    }
    function enableLostDialog() {
        el.lost = document.querySelector(`#lost-dialog-${lang}`);
        el.lost.addEventListener("cancel", e => e.preventDefault());
        window.addEventListener("lostlevel", e => {
            el.lost.showModal();
        });
        addDifficultyTemplate(el.lost, lang);
    }
    function enablePauseDialog() {
        el.pause = document.querySelector(`#pause-dialog-${lang}`);
        const okButton = el.pause.querySelector("button");
        okButton.addEventListener("click", e => {
            el.pause.close();
            el.game.unpause();
            e.stopImmediatePropagation();
        });
        window.addEventListener("pause", e => {
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
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/service-worker.js")
                .then(registration => {
                console.info(`Service Worker registered with scope "${registration.scope}"`);
            })
                .catch(error => {
                console.error(`Service Worker registration failed: ${error}`);
            });
        }
        customElements.define("tracer-game", TracerGame);
        el.game = document.querySelector("tracer-game");
        el.countdown = document.querySelector("#countdown");
        addEventListener("countdown", ((e) => {
            el.countdown.textContent = e.detail;
        }));
        document.addEventListener("touchstart", () => el.game.resumeAudio(), { once: true });
        document.addEventListener("click", () => el.game.resumeAudio(), { once: true });
        addEventListener("keyup", onKeyUp);
        enableCountdownDialog();
        enableSettingsDialog();
        enableWonDialog();
        enableLostDialog();
        enablePauseDialog();
        enableSplashScreen().showModal();
    }
    addEventListener("pageshow", main);
})(Game || (Game = {}));
//# sourceMappingURL=game.js.map