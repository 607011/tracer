(function (window) {
    "use strict";

    /**
     * Enumeration of possible states in the Tracer game.
     */
    class State {
        static i = 0;
        static None = State.i++;
        static Splash = State.i++;;
        static Play = State.i++;
        static Countdown = State.i++;
        static AnimatePath = State.i++;;
        static Paused = State.i++;;
        static Help = State.i++;;
        static Wrong = State.i++;;
        static Won = State.i++;;
        static Lost = State.i++;;
        static Start = State.i++;;
        static toString(state) {
            switch (state) {
                case State.None:
                    return "None";
                case State.Splash:
                    return "Splash";
                case State.Play:
                    return "Play";
                case State.AnimatePath:
                    return "AnimatePath";
                case State.Countdown:
                    return "Countdown";
                case State.Paused:
                    return "Paused";
                case State.Help:
                    return "Help";
                case State.Wrong:
                    return "Wrong";
                case State.Won:
                    return "Won";
                case State.Lost:
                    return "Lost";
                case State.Start:
                    return "Start";
                default:
                    return "Unknown";
            }
        }
    }

    /**
     * Enumeration of possible directions in the Tracer game.
     */
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

    // Create a lookup map for `DirectionDelta`
    const DirectionLookup = {};
    Object.keys(DirectionDelta).forEach(key => {
        const dir = DirectionDelta[key];
        // Use dx,dy as a composite key
        DirectionLookup[`${dir.dx},${dir.dy}`] = key;
    });
    Object.freeze(DirectionLookup);

    /**
     * How many 45-degree turns are required to align the current direction with the "north" direction.
     */
    const ProbTableTurns = { N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7, };
    Object.freeze(ProbTableTurns);

    /**
     * Custom HTML element that implements a path-tracing game.
     * 
     * The game consists of a grid of tiles where the player must trace a path that
     * was shown at the beginning of the level. The player clicks tiles in sequence to
     * recreate the path, which must be completed before the timer runs out.
     * 
     * @class TracerGame
     * @extends HTMLElement
     */
    class TracerGame extends HTMLElement {
        static DEFAULT_GAIN_VALUE = 0.5;

        /**
         * @type {Object[]}
         */
        _levels = [
            {
                width: 7,
                height: 5,
                secsToSolve: 30,
                numStepsRequired: 11, // must meet or exceed `height`
                numTurnsRequired: 6,
                tileAnimationDurationSecs: 1.5,
                directionProbs: [
                    // NW   N    NE
                    //  W   X    E
                    // SW   S    SE
                    [0.16, 0.42, 0.16],
                    [0.08, 0.00, 0.08],
                    [0.00, 0.00, 0.00],
                ],
                forbiddenTurns: {
                    NE: ["S", "W", "SW"],
                    NW: ["S", "E", "SE"],
                    SE: ["N", "W", "NW"],
                    SW: ["N", "E", "NE"],
                    N: ["SW", "SE", "S"],
                    E: ["NW", "SW", "W"],
                    S: ["NE", "NW", "N"],
                    W: ["NE", "SE", "E"],
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
         * State of the game.
         * @type {State}
         */
        _state = State.None;

        /** @type {Number} */
        _lastTapTime = 0;

        /** Audio context
         * @type {AudioContext}
         */
        _audioCtx;

        /**
         * @type {Boolean}
         */
        _soundEnabled = true;

        /**
         * @type {Object}
         */
        _sounds = {};

        /**
         * Sequence of tile coordinates representing the path the player has to go.
         * @type {Number[]}
         */
        _path = [];

        /**
         * Pointer to the current tile in the path.
         * @type {Number}
         */
        _pathIndex = 0;

        /**
         * @type {Number}
         */
        _t0 = performance.now();

        /**
         * @type {Number}
         */
        _elapsed = 0;

        /**
         * In prelude state the countdown is not started.
         */
        _prelude = true;

        /**
         * @type {Number}
         */
        _animationFrameID;

        /**
         * @type {Number}
         */
        _timeoutID;

        /**
         * Construct a new `TracerGame` element.
         */
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
    transition: background-color 60ms, box-shadow 60ms;
}
.tile.path {
    animation-name: path;
    animation-duration: ${levelData.tileAnimationDurationSecs}s;
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
                    tile.dataset.x = x;
                    tile.dataset.y = y;
                    this._tiles[y][x] = tile;
                }
            }
            this._board.addEventListener("click", e => {
                if (e.target.classList.contains("tile")) {
                    this._onTileClick(e);
                }
            });
            this._board.replaceChildren(...this._tiles.flat());
            this._shadow.appendChild(this._board);
            this._shadow.appendChild(this._dynamicStyles);
            this._shadow.appendChild(styles);
            this._activateEventListeners();
            this._initAudio();
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

        /**
         * Animate the path on the game board by adding the "path" class to
         * each tile in the path which triggers a CSS animation.
         */
        _animatePath() {
            const levelData = this._levels[this._levelNum];
            const delayFactor = levelData.tileAnimationDurationSecs / (this._path.length * 3);
            this._path.forEach(({ x, y }, i) => {
                const tile = this._tiles[y][x];
                tile.classList.add("path");
                tile.style.animationDelay = `${i * delayFactor}s`;
            });
        }

        /**
         * Randomly generate a path for the game, beginning at the bottom row and
         * working its way to the top row. The path must have a minimum number of steps
         * and turns as defined in the level data.
         */
        _createPath() {
            const levelData = this._levels[this._levelNum];
            // Check if all required properties are defined in levelData
            const requiredProps = [
                "width", "height", "numStepsRequired", "numTurnsRequired",
                "tileAnimationDurationSecs", "directionProbs", "forbiddenTurns", "crossingAllowed"
            ];
            for (const prop of requiredProps) {
                if (!(prop in levelData)) {
                    console.error(`Missing required property in level data: ${prop}`);
                }
            }
            let path;
            let current = { x: null, y: null };
            let turnCount;
            let numTries = 0;
            do {
                ++numTries;
                path = [];
                const visited = Array.from({ length: levelData.height }, () => Array(levelData.width).fill(false));
                // First position is at the bottom row in a random column
                current = {
                    x: Math.floor(Math.random() * levelData.width),
                    y: levelData.height - 1,
                };
                visited[current.y][current.x] = true;
                path.push({ ...current });
                // Choose a random direction to start with
                let currentDirection = ["N", "E", "W"][Math.floor(Math.random() * 3)];
                turnCount = 0;
                // While we haven't reached the top row with the correct number of steps and turns ...
                while (current.y > 0 && (path.length < levelData.numStepsRequired || turnCount < levelData.numTurnsRequired)) {
                    // Get positions of all neighboring cells
                    const allDestinations = Object.values(DirectionDelta).map(direction => {
                        return { x: current.x + direction.dx, y: current.y + direction.dy }
                    });
                    // Filter out invalid destinations
                    const possibleDestinations = allDestinations
                        // stay within the bounds of the grid
                        .filter(dst =>
                            dst.x >= 0 && dst.x < levelData.width &&
                            dst.y >= 0 && dst.y < levelData.height
                        )
                        // only consider unvisited cells
                        .filter(dst => !visited[dst.y][dst.x]);

                    // Filter out moves that would create crossings unless crossing is allowed
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

                    // Rotate probability matrix to align current direction to "north"
                    let probs = TracerGame.rotateCW(levelData.directionProbs.map(row => row.slice()),
                        ProbTableTurns[currentDirection]);

                    // Calculate the total probability of all valid moves
                    // We'll use this to normalize our random selection
                    const totalProbability = validDestinations.reduce((sum, move) => {
                        // Get the relative x,y coordinates (-1, 0, or 1 in each dimension)
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        // Add the probability from our rotated probability matrix
                        // +1 to indices because the matrix is 0-indexed but coordinates are -1, 0, 1
                        return sum + probs[dy + 1][dx + 1];
                    }, 0);

                    // If no possible moves, break out and regenerate path
                    if (totalProbability === 0 || validDestinations.length === 0)
                        break;

                    // Generate random number within range of total probability
                    const randomNumber = Math.random() * totalProbability;
                    let cumulativeProbability = 0;
                    let nextDirection;
                    // Iterate through each possible destination
                    for (const move of validDestinations) {
                        // Calculate the relative direction (dx, dy) from current position
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        // Get the probability for this move from the probability matrix
                        const prob = probs[dy + 1][dx + 1];
                        // Add this probability to our running sum
                        cumulativeProbability += prob;
                        // If our random number falls within this range, choose this direction
                        if (randomNumber >= cumulativeProbability)
                            continue;
                        // Convert dx,dy to a named direction (N, NE, E, etc.)
                        nextDirection = DirectionLookup[`${dx},${dy}`];
                        // Check if this is a forbidden turn from our current direction
                        if (levelData.forbiddenTurns &&
                            Array.isArray(levelData.forbiddenTurns[currentDirection]) &&
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

                    // Advance to the next position in the path
                    current = { x: current.x + DirectionDelta[nextDirection].dx, y: current.y + DirectionDelta[nextDirection].dy };
                    path.push({ ...current });
                    // Count turns
                    turnCount += currentDirection !== nextDirection ? 1 : 0;
                    currentDirection = nextDirection;
                }
            } while (path.length !== levelData.numStepsRequired || turnCount !== levelData.numTurnsRequired || current.y !== 0);
            this._path = path;
            console.debug(numTries, path);
        }

        _activateEventListeners() {
            addEventListener("touchstart", () => this._onTouchStart(), { passive: false });
            addEventListener("touchend", () => this._onTouchEnd());
        }

        newGame() {
            this._prelude = true;
            this.state = State.Start;
        }

        /**
         * 
         */
        _update() {
            if (this._prelude || ![State.AnimatePath, State.Play, State.Wrong].includes(this._state))
                return;
            const levelData = this._levels[this._levelNum];
            this._elapsed = 1e-3 * (performance.now() - this._t0);
            dispatchEvent(new CustomEvent("countdown", { detail: Math.max(0, (levelData.secsToSolve - this._elapsed).toFixed(2)) }));
            if (this._elapsed > levelData.secsToSolve) {
                this.state = State.Lost;
            }
            this._animationFrameID = requestAnimationFrame(() => this._update());
        }

        /**
         * @param {State} state
         */
        set state(state) {
            if (this._state === state)
                return;
            this._state = state;
            const levelData = this._levels[this._levelNum];
            switch (state) {
                case State.Start:
                    this._elapsed = 0;
                    this.state = State.Countdown;
                    el.countdown.textContent = levelData.secsToSolve.toFixed(2);
                    break;
                case State.Countdown:
                    this._playSound("countdown");
                    dispatchEvent(new CustomEvent("showcountdown"));
                    this._timeoutID = setTimeout(() => {
                        this.state = State.AnimatePath;
                    }, 1400);
                    break;
                case State.AnimatePath:
                    this._pathIndex = 0;
                    this._animatePath();
                    this._timeoutID = setTimeout(() => {
                        this.state = State.Play;
                    }, 1e3 * levelData.tileAnimationDurationSecs);
                    this._animationFrameID = requestAnimationFrame(() => this._update());
                    break;
                case State.Play:
                    this._board.classList.remove("locked");
                    this._tiles.flat().forEach(tile => tile.classList.remove("path"));
                    this._t0 = performance.now() - 1e3 * this._elapsed;
                    this._animationFrameID = requestAnimationFrame(() => this._update());
                    this._prelude = false;
                    break;
                case State.Wrong:
                    this._playSound("alarm");
                    this._board.classList.add("wrong");
                    this._tiles.flat().forEach(tile => tile.classList.remove("visited"));
                    this._timeoutID = setTimeout(() => {
                        this._board.classList.remove("wrong");
                        const elapsed = 1e-3 * (performance.now() - this._t0);
                        if (elapsed < levelData.secsToSolve) {
                            this.state = State.Countdown;
                        }
                    }, 1e3 * this._sounds["alarm"].buffer.duration);
                    this._animationFrameID = requestAnimationFrame(() => this._update());
                    break;
                case State.Paused:
                    this._board.classList.add("locked");
                    dispatchEvent(new CustomEvent("pause"));
                    cancelAnimationFrame(this._animationFrameID);
                    break;
                case State.Won:
                    this._board.classList.add("locked");
                    this._playSound("tada");
                    this._tiles.flat().forEach(tile => tile.classList.remove("visited"));
                    this._createPath();
                    dispatchEvent(new CustomEvent("wonlevel"));
                    cancelAnimationFrame(this._animationFrameID);
                    this._elapsed = 0;
                    break;
                case State.Lost:
                    this._stopAllSounds();
                    this._playSound("alarm");
                    this._board.classList.remove("wrong");
                    this._tiles.flat().forEach(tile => tile.classList.remove("visited", "path"));
                    this._createPath();
                    dispatchEvent(new CustomEvent("lostlevel"));
                    clearTimeout(this._timeoutID);
                    cancelAnimationFrame(this._animationFrameID);
                    break;
                case State.Help:
                    break;
                case State.Splash:
                    el.countdown.textContent = levelData.secsToSolve.toFixed(2);
                    break;
                case State.None:
                // fallthrough
                default:
                    break;
            }
        }

        /**
         * @returns {State}
         */
        get state() {
            return this._state;
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
            if (this._state !== State.Play)
                return;
            const x = parseInt(e.target.dataset.x);
            const y = parseInt(e.target.dataset.y);
            const tile = this._tiles[y][x];
            const wantedTile = this._path[this._pathIndex];
            if (wantedTile.x === x && wantedTile.y === y) {
                this._playSound("step");
                tile.classList.add("visited");
                ++this._pathIndex;
                if (this._pathIndex === this._path.length) {
                    this.state = State.Won;
                }
            }
            else {
                this.state = State.Wrong;
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

        pause() {
            this.state = State.Paused;
        }

        unpause() {
            this.state = State.Play;
        }

        _doPlaySound(name) {
            // According to https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode,
            // an `AudioBufferSourceNode` can only be played once; after each call to `start()`,
            // you have to create a new `AudioBufferSourceNode` if you want to play the same sound
            // again.
            const source = this._audioCtx.createBufferSource();
            source.buffer = this._sounds[name].buffer;
            source.connect(this._gainNode);
            source.start();
            this._sounds[name].source = source;
        }

        _playSound(name) {
            if (!this._soundEnabled)
                return;
            if (this._audioCtx.state === "suspended") {
                this.resumeAudio().then(() => {
                    this._doPlaySound(name);
                });
            }
            else {
                this._doPlaySound(name);
            }
        }

        _stopSound(name) {
            if (this._sounds[name].source) {
                this._sounds[name].source.stop();
            }
        }

        _stopAllSounds() {
            for (const name in this._sounds) {
                this._stopSound(name);
            }
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
            for (const name of ["countdown", "alarm", "step", "tada"]) {
                this._sounds[name] = {};
                fetch(`static/sounds/${name}.mp3`)
                    .then(response => response.arrayBuffer())
                    .then(arrayBuffer => this._audioCtx.decodeAudioData(arrayBuffer))
                    .then(audioBuffer => {
                        this._sounds[name].buffer = audioBuffer;
                    })
                    .catch(error => {
                        console.error("Failed to load sound:", error);
                    });
            }
        }
    }

    /************************/
    /*                      */
    /* Global space of code */
    /*                      */
    /************************/

    const el = {};
    const lang = document.location.hostname.startsWith("leuchtspur")
        ? "de"
        : "en";

    function onKeyUp(e) {
        switch (e.key) {
            case "F1":
            // fallthrough
            case "?":
            // fallthrough
            case "h":
                el.game.pause();
                el.help.showModal();
                el.help.addEventListener("close", e => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }, { once: true });
                break;
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

    function enableSplashScreen() {
        el.splash = document.querySelector(`#splash-screen-${lang}`);
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
        el.help = document.querySelector(`#help-dialog-${lang}`);
        const okButton = el.help.querySelector("button");
        okButton.addEventListener("click", e => {
            el.help.close();
            e.stopImmediatePropagation();
        });
    }

    function enableWonDialog() {
        el.won = document.querySelector(`#won-dialog-${lang}`);
        el.won.addEventListener("cancel", e => e.preventDefault());
        const okButton = el.won.querySelector("button");
        okButton.addEventListener("click", e => {
            el.won.close();
            el.game.nextLevel();
            e.stopImmediatePropagation();
        });
        window.addEventListener("wonlevel", e => {
            el.won.showModal();
        });
    }

    function enableLostDialog() {
        el.lost = document.querySelector(`#lost-dialog-${lang}`);
        el.lost.addEventListener("cancel", e => e.preventDefault());
        const okButton = el.lost.querySelector("button");
        okButton.addEventListener("click", e => {
            el.lost.close();
            el.game.newGame();
            e.stopImmediatePropagation();
        });
        window.addEventListener("lostlevel", e => {
            el.lost.showModal();
        });
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
            setTimeout(() => {
                el.threeTwoOne.textContent = "2";
                el.threeTwoOne.className = "two";
            }, 416);
            setTimeout(() => {
                el.threeTwoOne.textContent = "1";
                el.threeTwoOne.className = "one";
            }, 832);
            setTimeout(() => {
                el.countdownDialog.close();
            }, 1264);
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

    function enableButtons() {
        el.fullScreenButton = document.querySelector("#fullscreen-toggle");
        el.fullScreenButton.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                enterFullscreen();
            }
            else {
                exitFullscreen();
            }
        });
        el.helpButton = document.querySelector(`#help-button`);
        el.helpButton.addEventListener("click", () => {
            el.help.showModal();
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
        addEventListener("countdown", e => {
            el.countdown.textContent = e.detail;
        });
        document.addEventListener("touchstart", () => el.game.resumeAudio(), { once: true });
        document.addEventListener("click", () => el.game.resumeAudio(), { once: true });
        addEventListener("keyup", onKeyUp);
        addEventListener("resize", () => el.game.adjustSize());
        enableButtons();
        enableCountdownDialog();
        enableHelpDialog();
        enableSettingsDialog();
        enableWonDialog();
        enableLostDialog();
        enablePauseDialog();
        enableSplashScreen().showModal();
    }

    addEventListener("pageshow", main);

})(window);
