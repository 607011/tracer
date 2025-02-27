(function (window) {
    "use strict";

    /**
     * Custom web element representing a Sokoban game.
     */
    class TracerGame extends HTMLElement {
        static DEFAULT_GAIN_VALUE = 0.5;

        /** 
         * Current level number (counting from 0).
         * @type {Number}
         */
        _levelNum = 5;

        /** 
         * Width and height in pixels of a single cell.
         * @type {Number}
         */
        _cellSize;

        /**
         * Number of tiles per row.
         */
        _width = 5;

        /**
         * Number of tiles per column.
         */
        _height = 5;

        /**
         * 2D array of HTML elements representing the game board. 
         * @type {HTMLElement[][]}
         */
        _tiles;

        /**
         * @type {Boolean}
         */
        _paused = true;

        /** @type {Number} */
        _lastTapTime = 0;

        /** Audio context
         * @type {AudioContext}
         */
        _audioCtx;

        _soundEnabled = true;

        _sounds = [];

        /**
         * Duration of the animation in seconds.
         * @type {Number}
         */
        _tileAnimationDuration = 1.0;

        /**
         * Number of steps required for a certain difficulty level.
         * @type {Number}
         */
        _numStepsRequired = 7;

        /**
         * `true` if it's the player's turn, `false` otherwise.
         * @type {Boolean}
         */
        _playersTurn = false;

        /**
         * Sequence of tile coordinates representing the path the player has to go.
         * @type {Number[]}
         */
        _path = [];

        constructor() {
            super();
        }

        connectedCallback() {
            this._shadow = this.attachShadow({ mode: "open" });
            this._style = document.createElement("style");
            this._style.textContent = `
:host {
    --cell-size: 60px;
    --tiles-per-row: ${this._width};
    --tiles-per-col: ${this._height};
}
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
    grid-template-columns: repeat(var(--tiles-per-col), var(--cell-size));
    grid-template-rows: repeat(--tiles-per-row, var(--cell-size));
    gap: 4px;
}
#board.inactive > div.tile {
    cursor: not-allowed;
}
#board.wrong > div.tile {
    background-color: var(--wrong-color) !important;
    box-shadow: 0 0 0 4px var(--wrong-color) !important;
}
.tile {
    display: block;
    box-sizing: content-box;
    width: var(--cell-size);
    height: var(--cell-size);
    background-color: var(--tile-color);
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
    line-height: var(--cell-size);
}
.tile.path {
    animation-name: path;
    animation-duration: ${this._tileAnimationDuration}s;
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
    animation-timing-function: cubic-bezier(.17,.67,.5,.99);
}

@keyframes path {
    0% {
        background-color: var(--tile-color);
    }
    50% {
        background-color: var(--path-color);
        box-shadow: 0 0 10px 4px var(--path-color);
    }
    100% {
        background-color: var(--tile-color);
    }
}
`;
            this._board = document.createElement("div");
            this._board.classList.add("inactive");
            this._board.id = "board";
            this._tiles = Array.from({ length: this._height }, () => Array(this._width).fill(null));
            for (let y = 0; y < this._height; ++y) {
                for (let x = 0; x < this._width; ++x) {
                    const tile = document.createElement("div");
                    tile.classList.add("tile");
                    tile.setAttribute("data-x", x);
                    tile.setAttribute("data-y", y);
                    tile.addEventListener("click", this._onTileClick.bind(this));
                    this._tiles[y][x] = tile;
                }
            }
            this._board.replaceChildren(...this._tiles.flat());
            this._shadow.appendChild(this._board);
            this._shadow.appendChild(this._style);
            this._activateEventListeners();
            this._initAudio();
            this._createPath();
            console.debug(this._path);
            for (let i = 0; i < this._path.length; ++i) {
                const { x, y } = this._path[i];
                const tile = this._tiles[y][x];
                tile.classList.add("path");
                tile.style.animationDelay = `${i * this._tileAnimationDuration / this._path.length}s`;
            }
        }

        /** 
         * Reset game data to its initial state.
         */
        reset() {
            this._autoplaying = false;
            this._restartLevel();
        }

        /**
         * @param {number} levelNum
         */
        set levelNum(levelNum) {
            this._levelNum = levelNum;
            if (this._levelNum < this._levels.length) {
                this._restartLevel();
            }
        }

        /** @returns {number} */
        get levelNum() {
            return this._levelNum;
        }

        nextLevel() {
            ++this._levelNum;
            this.buildHash();
            this._restartLevel();
        }

        // This default probability matrix gives a 40% chance of moving north,
        // 14% chanche of moving NE and NW, 8% chance of moving east or west,
        // and 4% chance of moving SE, SW, or S.
        static DirectionProbabilities = [
            [0.16, 0.42, 0.16],
            [0.08, 0.00, 0.08],
            [0.05, 0.00, 0.05],
        ];

        /**
          * Turn 3x3 `matrix` in `eightsTurns` 45-degree steps clockwise.
          */
        static rotateCW(matrix, eightsTurns = 1) {
            const result = Array.from({ length: 3 }, () => Array(3).fill(-1));
            // center element
            result[1][1] = matrix[1][1];
            for (let turn = 0; turn < eightsTurns; ++turn) {
                // top row
                result[0][2] = matrix[0][1];
                result[0][1] = matrix[0][0];
                // bottom row
                result[2][0] = matrix[2][1];
                result[2][1] = matrix[2][2];
                // right column
                result[2][2] = matrix[1][2];
                result[1][2] = matrix[0][2];
                // left column
                result[0][0] = matrix[1][0];
                result[1][0] = matrix[2][0];
                matrix = result.map(row => row.slice());
            }
            return matrix;
        }

        _createPath() {
            const Directions = {
                N: { dx: 0, dy: -1 },
                S: { dx: 0, dy: 1 },
                E: { dx: 1, dy: 0 },
                W: { dx: -1, dy: 0 },
                NE: { dx: 1, dy: -1 },
                NW: { dx: -1, dy: -1 },
                SE: { dx: 1, dy: 1 },
                SW: { dx: -1, dy: 1 },
            };
            let path;
            do {
                path = [];
                const visited = Array.from({ length: this._height }, () => Array(this._width).fill(false));
                let current = { x: Math.floor(Math.random() * this._height), y: this._height - 1 };
                visited[current.y][current.x] = true;
                path.push({ ...current });
                console.debug(`Starting at ${current.x}, ${current.y}`);
                let currentDirection = "N";
                while (current.y > 0) {
                    const allDestinations = Object.values(Directions).map(direction => {
                        return { x: current.x + direction.dx, y: current.y + direction.dy }
                    });
                    const possibleDestinations = allDestinations.filter(dst =>
                        dst.x >= 0 && dst.x < this._width &&
                        dst.y >= 0 && dst.y < this._height
                    ).filter(dst => !visited[dst.y][dst.x]);
                    console.debug(possibleDestinations);
                    let probs = TracerGame.DirectionProbabilities.map(row => row.slice());
                    // Rotate the probability matrix so that the current direction is "north"
                    switch (currentDirection) {
                        case "N":
                            break;
                        case "NE":
                            probs = TracerGame.rotateCW(probs, 1);
                            break;
                        case "E":
                            probs = TracerGame.rotateCW(probs, 2);
                            break;
                        case "SE":
                            probs = TracerGame.rotateCW(probs, 3);
                            break;
                        case "S":
                            probs = TracerGame.rotateCW(probs, 4);
                            break;
                        case "SW":
                            probs = TracerGame.rotateCW(probs, 5);
                            break;
                        case "W":
                            probs = TracerGame.rotateCW(probs, 6);
                            break;
                        case "NW":
                            probs = TracerGame.rotateCW(probs, 7);
                            break;
                    }
                    let nextDirection = "";
                    // Calculate total probability of all possible moves
                    let totalProbability = 0;
                    for (const move of possibleDestinations) {
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) {
                            totalProbability += probs[dy + 1][dx + 1];
                        }
                    }
                    // Generate random number within range of total probability
                    let randomNumber = Math.random() * totalProbability;
                    let cumulativeProbability = 0;
                    for (const move of possibleDestinations) {
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) {
                            const prob = probs[dy + 1][dx + 1];
                            cumulativeProbability += prob;
                            if (randomNumber < cumulativeProbability) {
                                nextDirection = Object.keys(Directions).find(key => Directions[key].dx === dx && Directions[key].dy === dy);
                                break;
                            }
                        }
                    }
                    current = { x: current.x + Directions[nextDirection].dx, y: current.y + Directions[nextDirection].dy };
                    path.push({ ...current });
                    currentDirection = nextDirection;
                    console.debug(`Moved ${nextDirection} to ${current.x}, ${current.y}`);
                }
            } while (path.length !== this._numStepsRequired);
            this._path = path;
        }

        _activateEventListeners() {
            document.addEventListener("visibilitychange", this._onVisibilityChange.bind(this));
            window.addEventListener("keydown", this._onKeyDown.bind(this));
            window.addEventListener("touchstart", this._onTouchStart.bind(this), { passive: false });
            window.addEventListener("touchend", this._onTouchEnd.bind(this));
        }

        _restartLevel() {
        }

        _onTileClick(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!this._playersTurn)
                return;
            const tile = e.target;
            const x = parseInt(tile.getAttribute("data-x"));
            const y = parseInt(tile.getAttribute("data-y"));

        }

        _onVisibilityChange(_e) {
            if (document.visibilityState === "visible") {
            }
            else {
            }
        }

        /** @param {TouchEvent} _e - not used */
        _onTouchStart(_e) {
            this._touchStartTime = performance.now();
        }

        /** @param {TouchEvent} e  */
        _onTouchEnd(e) {
            const currentTime = performance.now();
            const touchDuration = currentTime - this._touchStartTime;
            if (touchDuration < 400) {
                this._onClick(e);
            }
            const tapLength = currentTime - this._lastTapTime;
            if (tapLength < 500 && tapLength > 0) {
                e.preventDefault(); // prevent double-tap to zoom
            }
            this._lastTapTime = currentTime;
        }

        /** @param {KeyboardEvent} e */
        _onKeyDown(_e) {
        }

        set soundEnabled(enabled) {
            this._soundEnabled = enabled;
            localStorage.setItem("tracer-sound-enabled", this._soundEnabled);
        }

        /**
         * @returns {Boolean} `true` if sound will be played
         */
        get soundEnabled() {
            return this._soundEnabled;
        }

        /**
         * @param {Boolean} paused - `true` if game should be paused, `false` otherwise
         */
        set paused(paused) {
            this._paused = paused;
        }

        /** @returns {Boolean} `true` if game is paused, `false` otherwise */
        get paused() {
            return this._paused;
        }

        _playSound(name) {
            if (!this._soundEnabled)
                return;
            // According to https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode,
            // an `AudioBufferSourceNode` can only be played once; after each call to `start()`,
            // you have to create a new `AudioBufferSourceNode` if you want to play the same sound
            // again.
            const source = this._audioCtx.createBufferSource();
            source.buffer = this._sounds[name].buffer;
            source.connect(this._gainNode);
            source.start();
        }

        resumeAudio() {
            return this._audioCtx.resume();
        }

        _initAudio() {
            this._audioCtx = new AudioContext();
            this._gainNode = this._audioCtx.createGain();
            this._gainNode.gain.value = parseFloat(localStorage.getItem("tracer-sound-volume") || TracerGame.DEFAULT_GAIN_VALUE.toString());
            this._gainNode.connect(this._audioCtx.destination);
            for (const name of Object.keys(this._sounds)) {
                fetch(`/sounds/${name}.mp3`)
                    .then(response => response.arrayBuffer())
                    .then(arrayBuffer => this._audioCtx.decodeAudioData(arrayBuffer))
                    .then(audioBuffer => this._sounds[name].buffer = audioBuffer)
                    .catch(error => {
                        console.error("Failed to load sound:", error);
                    });
            }
        }

        showSettings() {
            dispatchEvent(new CustomEvent("showsettings"));
        }

        showHelp() {
            dispatchEvent(new CustomEvent("showhelp"));
        }

    }

    /************************/
    /*                      */
    /* Global space of code */
    /*                      */
    /************************/

    let el = {};

    function onKeyUp(e) {
        switch (e.key) {
            case "?":
            // fallthrough
            case "h":
                el.game.showHelp();
                break;
            default:
                break;
        }
    }

    function enableSplashScreen() {
        el.splash = document.querySelector("#splash-screen");
        const okButton = el.splash.querySelector("button");
        okButton.addEventListener("click", e => {
            el.splash.close();
            el.game.resumeAudio()
                .then(() => {
                    el.game.paused = false;
                });
            e.stopImmediatePropagation();
        });
        return el.splash;
    }

    function enableHelpDialog() {
        el.help = document.querySelector("#help-dialog");
        const okButton = el.help.querySelector("button");
        okButton.addEventListener("click", e => {
            el.help.close();
            e.stopPropagation();
        });
        window.addEventListener("showhelp", () => {
            el.help.showModal();
        });
    }

    function enableLevelCompleteDialog() {
        el.levelComplete = document.querySelector("#level-complete-dialog");
        const okButton = el.levelComplete.querySelector("button");
        okButton.addEventListener("click", e => {
            el.levelComplete.close();
            el.game.nextLevel();
            e.stopPropagation();
        });
        const tryAgainButton = el.levelComplete.querySelector("button[data-id='try-again']");
        tryAgainButton.addEventListener("click", e => {
            el.levelComplete.close();
            el.game.reset();
            e.stopPropagation();
        });
        window.addEventListener("levelcomplete", e => {
            el.levelComplete.querySelector("p").innerHTML = `Congratulations!.`;
            el.levelComplete.querySelector("button").textContent = "Next level";
            el.levelComplete.showModal();
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

        customElements.define("tracer-game", TracerGame);
        el.game = document.querySelector("tracer-game");

        window.addEventListener("keyup", onKeyUp);
        enableHelpDialog();
        enableSettingsDialog();
        enableLevelCompleteDialog();
        // enableSplashScreen().showModal();
    }

    window.addEventListener("pageshow", main);

})(window);
