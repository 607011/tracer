(function (window) {
    "use strict";

    /**
     * Custom web element representing the Tracer game.
     */
    class TracerGame extends HTMLElement {
        static DEFAULT_GAIN_VALUE = 0.5;

        _levels = [
            {
                width: 8,
                height: 6,
                numStepsRequired: 10,
                numTurnsRequired: 8,
                tileAnimationDuration: 1.5,
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

        _sounds = {};

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

        /**
         * Lifecycle callback that is invoked when the element is added to the DOM.
         * Sets up the shadow DOM, initializes styles, creates the game board with tiles,
         * and sets up event listeners. Also initializes the audio system and creates
         * the initial game path.
         */
        connectedCallback() {
            const levelData = this._levels[0];
            this._shadow = this.attachShadow({ mode: "open" });
            this._dynamicStyles = document.createElement("style");
            this._updateDynamicStyles();
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

        _updateDynamicStyles() {
            const levelData = this._levels[this._levelNum];
            this._dynamicStyles.textContent = `
:host {
    --cell-size: ${80 / Math.max(levelData.width, levelData.height)}vmin;
    --tiles-per-row: ${levelData.width};
    --tiles-per-col: ${levelData.height};
}
`;
        }

        adjustSize() {
            this._updateDynamicStyles();
        }

        /**
         * @param {number} levelNum
         */
        set levelNum(levelNum) {
            if (this._levelNum < this._levels.length) {
                this._levelNum = levelNum;
                this._updateDynamicStyles();
            }
            this.restart();
        }

        /** @returns {number} */
        get levelNum() {
            return this._levelNum;
        }

        nextLevel() {
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
                "width", "height", "numStepsRequired", "numTurnsRequired",
                "tileAnimationDuration", "directionProbabilities", "forbiddenTurns", "crossingAllowed"
            ];
            for (const prop of requiredProps) {
                if (!(prop in levelData)) {
                    console.error(`Missing required property in level data: ${prop}`);
                    throw new Error(`Missing required property in level data: ${prop}`);
                }
            }
            const DIRECTIONS = {
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
            Object.keys(DIRECTIONS).forEach(key => {
                const dir = DIRECTIONS[key];
                // Use dx,dy as a composite key
                directionLookup[`${dir.dx},${dir.dy}`] = key;
            });
            Object.freeze(directionLookup);
            const ProbTableTurns = { N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7, };
            Object.freeze(ProbTableTurns);
            let path;
            let current = { x: null, y: null };
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
                while (current.y > 0 && (path.length < levelData.numStepsRequired || turnCount < levelData.numTurnsRequired)) {
                    // while we haven't reached the top row
                    const allDestinations = Object.values(DIRECTIONS).map(direction => {
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

                    // Calculate the total probability of all valid moves
                    // We'll use this to normalize our random selection
                    const totalProbability = validDestinations.reduce((sum, move) => {
                        // Get the relative x,y coordinates (-1, 0, or 1 in each dimension)
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        // Only consider moves within the immediate 3x3 grid
                        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) {
                            // Add the probability from our rotated probability matrix
                            // +1 to indices because the matrix is 0-indexed but coordinates are -1, 0, 1
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
                    // Iterate through each possible destination
                    for (const move of validDestinations) {
                        // Calculate the relative direction (dx, dy) from current position
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        // Only consider immediate neighbors (3x3 grid around current position)
                        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) {
                            // Get the probability for this move from the probability matrix
                            const prob = probs[dy + 1][dx + 1];
                            // Add this probability to our running sum
                            cumulativeProbability += prob;
                            // If our random number falls within this range, choose this direction
                            if (randomNumber < cumulativeProbability) {
                                // Convert dx,dy to a named direction (N, NE, E, etc.)
                                nextDirection = directionLookup[`${dx},${dy}`];
                                // Check if this is a forbidden turn from our current direction
                                if (levelData.forbiddenTurns &&
                                    levelData.forbiddenTurns.hasOwnProperty(currentDirection) &&
                                    levelData.forbiddenTurns[currentDirection].includes(nextDirection)) {
                                    // Skip this move and reduce cumulative probability
                                    cumulativeProbability -= prob;
                                    continue;
                                }
                                // Mark the chosen cell as visited
                                visited[move.y][move.x] = true;
                                // Exit the loop - we've found our next move
                                break;
                            }
                        }
                    }

                    // If no valid direction found, break and regenerate path
                    if (!nextDirection || !DIRECTIONS[nextDirection])
                        break;

                    // Advance to the next position in the path
                    current = { x: current.x + DIRECTIONS[nextDirection].dx, y: current.y + DIRECTIONS[nextDirection].dy };
                    path.push({ ...current });
                    // Count turns
                    turnCount += currentDirection !== nextDirection ? 1 : 0;
                    currentDirection = nextDirection;
                }
            } while (path.length !== levelData.numStepsRequired || turnCount !== levelData.numTurnsRequired || current.y !== 0);
            this._path = path;
            console.debug(numTries, path);
        }

        /**
         * Sets up event listeners for the game.
         * 
         * This method attaches event handlers for:
         * - Document visibility changes to pause/resume the game when tab focus changes
         * - Keyboard input for game controls
         * - Touch events for mobile device interaction
         * 
         * @private
         * @method _activateEventListeners
         * @memberof Game
         */
        _activateEventListeners() {
            document.addEventListener("visibilitychange", this._onVisibilityChange.bind(this));
            window.addEventListener("touchstart", this._onTouchStart.bind(this), { passive: false });
            window.addEventListener("touchend", this._onTouchEnd.bind(this));
        }

        /**
         * Restarts the current level.
         * This method resets the path index to 0, triggers the path animation,
         * and schedules unlocking the level after the animation completes.
         * The unlock timing is based on the current level's tile animation duration.
         */
        restart() {
            const levelData = this._levels[this._levelNum];
            this._pathIndex = 0;
            this._animatePath();
            setTimeout(() => {
                this._unlock();
            }, levelData.tileAnimationDuration * 1000);
        }

        newGame() {
            this._playSound("tada");
            this.restart();
        }

        /**
         * @private
         */
        _lock() {
            this._board.classList.add("locked");
            this._playersTurn = false;
        }

        /**
         * @private
         */
        _unlock() {
            this._board.classList.remove("locked");
            this._playersTurn = true;
        }

        /**
         * Handles the click event on a tile in the game board.
         * 
         * @param {MouseEvent} e - The click event object
         * @private
         */
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
                this._playSound("step");
                tile.classList.add("visited");
                ++this._pathIndex;
                if (this._pathIndex === this._path.length) {
                    this._playSound("tada");
                    dispatchEvent(new CustomEvent("levelcomplete"));
                    this._lock();
                    this._tiles.flat().forEach(tile => tile.classList.remove("visited", "path"));
                    this._createPath();
                }
            }
            else {
                this._playSound("alarm");
                this._board.classList.add("wrong");
                this._tiles.flat().forEach(tile => tile.classList.remove("visited", "path"));
                setTimeout(() => {
                    this._board.classList.remove("wrong");
                    this.restart();
                }, 1000);
            }
        }

        /**
         * @private
         */
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

        async _playSound(name) {
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

        /**
         * Resumes the audio context if it was suspended.
         * This is typically used to resume audio playback after a user interaction,
         * as many browsers require user gesture to start audio playback.
         * 
         * @returns {Promise} A promise that resolves when the audio context has resumed.
         */
        resumeAudio() {
            return this._audioCtx.resume();
        }

        /**
         * Initialize audio system for the game.
         * Creates an AudioContext, a gain node to control volume, and 
         * loads all sound files defined in this._sounds from the /sounds/ directory.
         * The volume is set from localStorage if available, otherwise uses the default gain value.
         * Sound files are fetched as MP3s and decoded into audio buffers for playback.
         * @private
         * @returns {void}
         */
        _initAudio() {
            this._audioCtx = new AudioContext();
            this._gainNode = this._audioCtx.createGain();
            this._gainNode.gain.value = parseFloat(localStorage.getItem("tracer-sound-volume") || TracerGame.DEFAULT_GAIN_VALUE.toString());
            this._gainNode.connect(this._audioCtx.destination);
            for (const name of ["alarm", "step", "tada"]) {
                this._sounds[name] = {};
                fetch(`static/sounds/${name}.mp3`)
                    .then(response => response.arrayBuffer())
                    .then(arrayBuffer => this._audioCtx.decodeAudioData(arrayBuffer))
                    .then(audioBuffer => this._sounds[name].buffer = audioBuffer)
                    .catch(error => {
                        console.error("Failed to load sound:", error);
                    });
            }

        }

        /**
         * Trigger an event to display the settings menu.
         * @fires CustomEvent#showsettings - A custom event indicating that the settings should be shown.
         */
        showSettings() {
            dispatchEvent(new CustomEvent("showsettings"));
        }

        /**
         * Trigger a 'showhelp' custom event to display help information.
         * This method dispatches a global event that can be listened for elsewhere in the application.
         * @fires CustomEvent#showhelp - A custom event indicating that help should be shown
         */
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
            case "F1":
            // fallthrough
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
        el.splash.addEventListener("cancel", e => e.preventDefault());
        el.splash.addEventListener("close", () => {
            el.game.newGame();
        });
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

    function enterFullscreen() {
        let element = document.documentElement;
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }

    function exitFullscreen() {
        if (document.fullscreenEnabled) {
            document.exitFullscreen();
        }
    }

    function main() {
        console.info("%cTracer %cstarted.", "color: #f33; font-weight: bold", "color: initial; font-weight: normal;");

        customElements.define("tracer-game", TracerGame);
        el.game = document.querySelector("tracer-game");

        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("resize", () => el.game.adjustSize());
        enableHelpDialog();
        enableSettingsDialog();
        enableLevelCompleteDialog();
        enableSplashScreen().showModal();

        el.fullScreenButton = document.querySelector("#fullscreen-toggle");
        el.fullScreenButton.addEventListener("click", () => {
            console.debug("Fullscreen button clicked", document.fullscreenEnabled);
            if (!document.fullscreenElement) {
                enterFullscreen();
            }
            else {
                exitFullscreen();
            }
        });
        el.helpButton = document.querySelector("#help-button");
        el.helpButton.addEventListener("click", () => {
            el.game.showHelp();
        });

        setTimeout(() => {
            window.scrollTo(0, 1);
        }, 100);
    }

    window.addEventListener("pageshow", main);

})(window);
