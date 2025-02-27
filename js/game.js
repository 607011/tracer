(function (window) {
    "use strict";

    /**
     * Custom web element representing a Sokoban game.
     */
    class TracerGame extends HTMLElement {
        static DEFAULT_GAIN_VALUE = 0.5;

        _levels = [
            {
                width: 8,
                height: 6,
                numStepsRequired: 10,
                numTurnsRequired: 8,
                tileAnimationDuration: 2,
                directionProbabilities: [
                    // NW   N    NE
                    //  W   X    E
                    // SW   S    SE
                    [0.16, 0.42, 0.16],
                    [0.08, 0.00, 0.08],
                    [0.00, 0.00, 0.00],
                ],
                forbiddenTurns: {
                    NE: ["S", "W"],
                    NW: ["S", "E"],
                    SE: ["N", "W"],
                    SW: ["N", "E"],
                    N: ["SW", "SE"],
                    E: ["NW", "SW"],
                    S: ["NE", "NW"],
                    W: ["NE", "SE"],
                },
                crossingAllowed: false,
            },
        ];

        /** 
         * Current level number (counting from 0).
         * @type {Number}
         */
        _levelNum = 0;

        /** 
         * Width and height in pixels of a single cell.
         * @type {Number}
         */
        _cellSize;

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
         * `true` if it's the player's turn, `false` otherwise.
         * @type {Boolean}
         */
        _playersTurn = false;

        /**
         * Sequence of tile coordinates representing the path the player has to go.
         * @type {Number[]}
         */
        _path = [];

        /**
         * Pointer to the current tile in the path.
         */
        _pathIndex = 0;

        constructor() {
            super();
        }

        _createDynamicStyles() {
            const levelData = this._levels[this._levelNum];
            this._dynamicStyles.textContent = `
:host {
    --cell-size: 60px;
    --tiles-per-row: ${levelData.width};
    --tiles-per-col: ${levelData.height};
}
`;
        }

        connectedCallback() {
            const levelData = this._levels[0];
            this._shadow = this.attachShadow({ mode: "open" });
            this._dynamicStyles = document.createElement("style");
            this._createDynamicStyles();
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
    gap: 4px;
}
#board.locked > div.tile {
    cursor: not-allowed;
}
#board.wrong > div.tile {
    background-color: var(--wrong-color) !important;
    box-shadow: 0 0 10px 4px var(--wrong-color) !important;
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
    animation-duration: ${levelData.tileAnimationDuration}s;
    animation-iteration-count: 1;
    animation-fill-mode: alternate;
    animation-timing-function: cubic-bezier(.32,.36,.04,.96);
}
.tile.visited {
    background-color: var(--visited-color);
    box-shadow: 0 0 10px 4px var(--visited-color);
}

@keyframes path {
    0% {
        background-color: var(--tile-color);
    }
    50% {
        background-color: var(--path-color);
        box-shadow: 0 0 10px 4px var(--path-color);
    }
}
`;
            this._board = document.createElement("div");
            this._board.classList.add("locked");
            this._board.id = "board";
            this._tiles = Array.from({ length: levelData.height }, () => Array(levelData.width).fill(null));
            for (let y = 0; y < levelData.height; ++y) {
                for (let x = 0; x < levelData.width; ++x) {
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
            this._shadow.appendChild(this._dynamicStyles);
            this._shadow.appendChild(styles);
            this._activateEventListeners();
            this._initAudio();
            this._lock();
            this._createPath();
        }

        /**
         * @param {number} levelNum
         */
        set levelNum(levelNum) {
            if (this._levelNum < this._levels.length) {
                this._levelNum = levelNum;
                this._createDynamicStyles();
                this.restart();
            }
        }

        /** @returns {number} */
        get levelNum() {
            return this._levelNum;
        }

        nextLevel() {
            // ++this.levelNum;
            this.newGame();
        }

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

        _animatePath() {
            const levelData = this._levels[this._levelNum];
            for (let i = 0; i < this._path.length; ++i) {
                const { x, y } = this._path[i];
                const tile = this._tiles[y][x];
                tile.classList.add("path");
                tile.style.animationDelay = `${i * levelData.tileAnimationDuration / this._path.length / 3}s`;
            }
        }

        _createPath() {
            const levelData = this._levels[this._levelNum];
            // Check if all required properties are defined in levelData
            const requiredProps = [
                'width', 'height', 'numStepsRequired', 'numTurnsRequired', 
                'tileAnimationDuration', 'directionProbabilities', 'forbiddenTurns', 'crossingAllowed'
            ];
            for (const prop of requiredProps) {
                if (!(prop in levelData)) {
                    console.error(`Missing required property in level data: ${prop}`);
                    throw new Error(`Missing required property in level data: ${prop}`);
                }
            }
            console.debug(levelData);
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
            // Create a lookup map once (at initialization)
            const directionLookup = {};
            Object.keys(Directions).forEach(key => {
                const dir = Directions[key];
                // Use dx,dy as a composite key
                directionLookup[`${dir.dx},${dir.dy}`] = key;
            });
            Object.freeze(directionLookup);
            const ProbTableTurns = {
                N: 0,
                NE: 1,
                E: 2,
                SE: 3,
                S: 4,
                SW: 5,
                W: 6,
                NW: 7,
            };
            Object.freeze(ProbTableTurns);
            let path;
            let current = { x: undefined, y: undefined };
            let turnCount;
            let numTries = 0;
            do {
                ++numTries;
                path = [];
                const visited = Array.from({ length: levelData.height }, () => Array(levelData.width).fill(false));
                current = { x: Math.floor(Math.random() * levelData.height), y: levelData.height - 1 };
                visited[current.y][current.x] = true;
                path.push({ ...current });
                let currentDirection = "N";
                turnCount = 0;
                // while we haven't reached the top row
                while (current.y > 0) {
                    const allDestinations = Object.values(Directions).map(direction => {
                        return { x: current.x + direction.dx, y: current.y + direction.dy }
                    });
                    const possibleDestinations = allDestinations
                        // stay within the bounds of the grid
                        .filter(dst =>
                            dst.x >= 0 && dst.x < levelData.width &&
                            dst.y >= 0 && dst.y < levelData.height
                        )
                        // only consider unvisited cells
                        .filter(dst => !visited[dst.y][dst.x]);
                    let probs = levelData.directionProbabilities.map(row => row.slice());
                    // Rotate the probability matrix so that the current direction is "north"
                    probs = TracerGame.rotateCW(probs, ProbTableTurns[currentDirection]);

                    // Filter out moves that would create crossings
                    const validDestinations = levelData.crossingAllowed
                        ? possibleDestinations
                        : possibleDestinations.filter(move => {
                            const dx = move.x - current.x;
                            const dy = move.y - current.y;
                            // Check for diagonal crossings
                            if (dx !== 0 && dy !== 0) {
                                const corner1 = { x: current.x, y: move.y };
                                const corner2 = { x: move.x, y: current.y };
                                // If both corners are visited, this would create a crossing
                                if (visited[corner1.y][corner1.x] && visited[corner2.y][corner2.x]) {
                                    return false;
                                }
                            }
                            return true;
                        });

                    const totalProbability = validDestinations.reduce((sum, move) => {
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) {
                            return sum + probs[dy + 1][dx + 1];
                        }
                        return sum;
                    }, 0);

                    // If no possible moves, break out and regenerate path
                    if (totalProbability === 0 || validDestinations.length === 0)
                        break;

                    // Generate random number within range of total probability
                    let randomNumber = Math.random() * totalProbability;
                    let cumulativeProbability = 0;
                    let nextDirection = "";
                    for (const move of validDestinations) {
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) {
                            const prob = probs[dy + 1][dx + 1];
                            cumulativeProbability += prob;
                            if (randomNumber < cumulativeProbability) {
                                // Find the direction name based on dx and dy
                                nextDirection = directionLookup[`${dx},${dy}`];
                                if (levelData.forbiddenTurns &&
                                    levelData.forbiddenTurns.hasOwnProperty(currentDirection) &&
                                    levelData.forbiddenTurns[currentDirection].includes(nextDirection)) {
                                    // Skip this move and reduce cumulative probability
                                    cumulativeProbability -= prob;
                                    continue;
                                }
                                visited[move.y][move.x] = true;
                                break;
                            }
                        }
                    }

                    // If no valid direction found, break and regenerate path
                    if (!nextDirection || !Directions[nextDirection])
                        break;

                    current = { x: current.x + Directions[nextDirection].dx, y: current.y + Directions[nextDirection].dy };
                    path.push({ ...current });
                    turnCount += currentDirection !== nextDirection ? 1 : 0;
                    currentDirection = nextDirection;
                }
            } while (path.length !== levelData.numStepsRequired || turnCount !== levelData.numTurnsRequired || current.y !== 0);
            this._path = path;
            console.debug(numTries, path);
        }

        _activateEventListeners() {
            document.addEventListener("visibilitychange", this._onVisibilityChange.bind(this));
            window.addEventListener("keydown", this._onKeyDown.bind(this));
            window.addEventListener("touchstart", this._onTouchStart.bind(this), { passive: false });
            window.addEventListener("touchend", this._onTouchEnd.bind(this));
        }

        restart() {
            const levelData = this._levels[this._levelNum];
            this._pathIndex = 0;
            this._animatePath();
            setTimeout(() => {
                this._unlock();
            }, levelData.tileAnimationDuration * 1000);
        }

        newGame() {
            this.restart();
        }

        _lock() {
            this._board.classList.add("locked");
            this._playersTurn = false;
        }

        _unlock() {
            this._board.classList.remove("locked");
            this._playersTurn = true;
        }

        _onTileClick(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!this._playersTurn)
                return;
            const x = parseInt(e.target.getAttribute("data-x"));
            const y = parseInt(e.target.getAttribute("data-y"));
            const tile = this._tiles[y][x];
            const wantedTile = this._path[this._pathIndex];
            if (wantedTile.x === x && wantedTile.y === y) {
                tile.classList.add("visited");
                ++this._pathIndex;
                if (this._pathIndex === this._path.length) {
                    dispatchEvent(new CustomEvent("levelcomplete"));
                    this._lock();
                    this._tiles.flat().forEach(tile => tile.classList.remove("visited", "path"));
                    this._createPath();
                }
            }
            else {
                this._board.classList.add("wrong");
                this._tiles.flat().forEach(tile => tile.classList.remove("visited", "path"));
                setTimeout(() => {
                    this._board.classList.remove("wrong");
                    this.restart();
                }, 1000);
            }
        }

        _onVisibilityChange(_e) {
            if (document.visibilityState === "visible") {
                el.splash.showModal();
            }
            else {
                this.restart();
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
                    el.game.newGame();
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
        window.addEventListener("levelcomplete", e => {
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
        enableSplashScreen().showModal();
    }

    window.addEventListener("pageshow", main);

})(window);
