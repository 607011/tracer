namespace Game {
    /**
     * Enumeration of possible states in the Tracer game.
     */
    enum State {
        None,
        Splash,
        Play,
        Countdown,
        AnimatePath,
        Paused,
        Help,
        Wrong,
        Won,
        Lost,
        Start
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
    const ProbTableTurns = { NE: 7, E: 6, SE: 5, S: 4, SW: 3, W: 2, NW: 1, N: 0 };
    Object.freeze(ProbTableTurns);

    /**
     * Type definition for level data configuration
     */
    interface LevelData {
        /** Width of the game board in tiles */
        width: number;
        /** Height of the game board in tiles */
        height: number;
        /** Time limit in seconds for solving the level */
        secsToSolve: number;
        /** Required number of direction changes in the path */
        numTurnsRequired: number;
        /** Duration in seconds for the path animation at the start */
        tileAnimationDurationSecs: number;
        /** 
         * Probability matrix for direction selection
         * Format: [
         *   [NW, N, NE],
         *   [W,  X, E],
         *   [SW, S, SE]
         * ]
         * where X is the current position (always 0)
         */
        directionProbs: number[][];
        /** 
         * Map of directions to arrays of forbidden turn directions
         * For example, forbiddenTurns.N contains directions that can't be turned to from North
         */
        forbiddenTurns: Record<string, string[]>;
        /** Whether the path is allowed to cross itself */
        crossingAllowed: boolean;
    }

    const DefaultDirectionProbs: number[][] = [
        // NW   N    NE
        //  W   X    E
        // SW   S    SE
        [0.16, 0.42, 0.16],
        [0.08, 0.00, 0.08],
        [0.00, 0.00, 0.00],
    ];

    const DefaultForbiddenTurns: Record<string, string[]> = {
        NE: ["S", "W", "SW"],
        NW: ["S", "E", "SE"],
        SE: ["N", "W", "NW"],
        SW: ["N", "E", "NE"],
        N: ["SW", "SE", "S"],
        E: ["NW", "SW", "W"],
        S: ["NE", "NW", "N"],
        W: ["NE", "SE", "E"],
    };

    /**
     * Interface representing a tile position in the game path
     */
    interface TilePosition {
        x: number;
        y: number;
    }

    /**
     * Return a `Promise` that resolves after the specified delay
     * @param ms delay in milliseconds
     * @returns {Promise} Promise that resolves after the delay
     */
    function delay(ms: number): Promise<void> {
        return new Promise<void>(resolve => this.timeoutID = setTimeout(resolve, ms));
    }

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
        static Levels: LevelData[] = [
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

        private level: LevelData;

        /**
         * 2D array of HTML elements representing the game board. 
         */
        private tiles: HTMLElement[][];

        /**
         * State of the game.
         */
        private _state: State = State.None;

        /**
         * Time of the last tap event.
         */
        private lastTapTime: number = 0;
        private touchStartTime: number;

        private audioCtx: AudioContext;
        private gainNode: GainNode;

        /**
         * If `false`, no sounds will be played.
         */
        private _soundEnabled: boolean = true;

        private sounds: object = {};

        /**
         * Sequence of tile coordinates representing the path the player has to go.
         */
        private path: TilePosition[] = [];

        /**
         * Pointer to the current tile in the path.
         */
        private pathIndex: number = 0;

        /**
         * Used to calculate elapsed time since the start of a level.
         */
        private t0: number = performance.now();

        /**
         * Elapsed time since the start of the level in seconds.
         */
        private elapsed: number = 0;

        /**
         * In prelude state the countdown is not started.
         */
        private prelude: boolean = true;

        private animationFrameID: number;
        private timeoutID: number;
        private shadow: ShadowRoot;
        private dynamicStyles: HTMLStyleElement;
        private board: HTMLElement;

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

        private updateDynamicStyles() {
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

        get levelCount(): number {
            return TracerGame.Levels.length;
        }

        private adjustSize(): void {
            this.updateDynamicStyles();
        }

        private buildBoard(): void {
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
            this.board.addEventListener("click", (e: MouseEvent) => {
                if ((e.target as HTMLElement).classList.contains("tile")) {
                    this.onTileClick(e);
                }
            });
            this.board.replaceChildren(...this.tiles.flat());
        }

        public set difficulty(difficulty: number) {
            this.level = TracerGame.Levels[Math.min(difficulty, TracerGame.Levels.length - 1)];
            this.updateDynamicStyles();
            this.buildBoard();
            this.createPath();
        }

        public get difficulty(): number {
            return Math.max(0, TracerGame.Levels.indexOf(this.level));
        }

        /**
          * Turn 3x3 `matrix` in `eightsTurns` 45-degree steps clockwise.
          */
        static rotateCW(matrix: number[][], eightsTurns = 1) {
            const result = Array.from({ length: 3 }, () => Array(3).fill(0));
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
        private animatePath(): void {
            const delayFactor = this.level.tileAnimationDurationSecs / (this.path.length * 3);
            this.path.forEach(({ x, y }, i) => {
                const tile = this.tiles[y][x];
                tile.classList.add("path");
                tile.style.animationDelay = `${i * delayFactor}s`;
            });
        }

        /**
         * Randomly generate a path for the game, beginning at the bottom row and
         * working its way to the top row. The path must have a minimum number of steps
         * and turns as defined in the level data.
         */
        private createPath(): void {
            const t0 = performance.now();
            let path: TilePosition[];
            let current: TilePosition;
            let turnCount: number;
            let numTries: number = 0;
            do {
                ++numTries;
                if (numTries > 5000) {
                    console.error("Failed to create path after 5000 tries");
                    return;
                }
                path = [];
                const visited = Array.from({ length: this.level.height }, () => Array(this.level.width).fill(false));
                // First position is at the bottom row in a random column
                current = {
                    x: Math.floor(Math.random() * this.level.width),
                    y: this.level.height - 1,
                };
                visited[current.y][current.x] = true;
                path.push({ ...current });
                // Choose a random direction to start with
                let currentDirection = "N";
                turnCount = 0;
                // While we haven't reached the top row with the correct number of steps and turns ...
                while (current.y > 0 && turnCount < this.level.numTurnsRequired) {
                    // Get positions of all neighboring cells
                    const allDestinations = Object.values(DirectionDelta).map(direction => {
                        return { x: current.x + direction.dx, y: current.y + direction.dy }
                    });
                    // Filter out invalid destinations
                    const possibleDestinations = allDestinations
                        // stay within the bounds of the grid
                        .filter(dst =>
                            dst.x >= 0 && dst.x < this.level.width &&
                            dst.y >= 0 && dst.y < this.level.height
                        )
                        // only consider unvisited cells
                        .filter(dst => !visited[dst.y][dst.x]);

                    // Filter out moves that would create crossings unless crossing is allowed
                    const validDestinations = this.level.crossingAllowed
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
                    let probs = TracerGame.rotateCW(this.level.directionProbs.map(row => row.slice()),
                        ProbTableTurns[currentDirection]);

                    // Calculate the total probability of all valid moves
                    // We'll use this to normalize our random selection
                    const totalProbability = validDestinations.reduce((sum, move) => {
                        // Get the relative x,y coordinates (-1, 0, or 1 in each dimension)
                        const dx = move.x - current.x;
                        const dy = move.y - current.y;
                        // Add the probability from our rotated probability matrix;
                        // +1 to indices because the matrix is 0-indexed but coordinates are -1, 0, 1
                        return sum + probs[dy + 1][dx + 1];
                    }, 0);

                    // If no possible moves, break out and regenerate path
                    if (totalProbability === 0 || validDestinations.length === 0)
                        break;

                    // Generate random number within range of total probability
                    const randomNumber = Math.random() * totalProbability;
                    let cumulativeProbability = 0;
                    let nextDirection: string;
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
                        if (this.level.forbiddenTurns &&
                            Array.isArray(this.level.forbiddenTurns[currentDirection]) &&
                            this.level.forbiddenTurns[currentDirection].includes(nextDirection)) {
                            // Skip this move
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
            } while (turnCount !== this.level.numTurnsRequired || current.y !== 0);
            this.path = path;
            console.debug(`New path created in ${performance.now() - t0}ms after ${numTries} tries: ${path.map(({ x, y }) => `(${x},${y})`).join(" → ")}`);
        }

        private activateEventListeners(): void {
            addEventListener("touchstart", e => this.onTouchStart(e), { passive: false });
            addEventListener("touchend", e => this.onTouchEnd(e));
            addEventListener("resize", () => this.adjustSize());
        }

        public newGame(): void {
            this.prelude = true;
            this.state = State.Start;
        }

        private update(): void {
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

        private set state(state: State) {
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
                    el.countdown!.textContent = this.level.secsToSolve.toFixed(2);
                    break;
                default:
                    break;
            }
        }

        public get state(): State {
            return this._state;
        }

        /**
         * Handles the click event on a tile in the game board.
         * 
         * @param {MouseEvent} e - The click event object
         * @private
         */
        private onTileClick(e: MouseEvent) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (this._state !== State.Play)
                return;
            const target = e.target as HTMLElement;
            const x = parseInt(target.dataset.x!);
            const y = parseInt(target.dataset.y!);
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

        private onTouchStart(_e: TouchEvent) {
            this.touchStartTime = performance.now();
        }

        private onTouchEnd(e: TouchEvent) {
            const currentTime = performance.now();
            const touchDuration = currentTime - this.touchStartTime;
            if (touchDuration < 400) {
                // Get the touch target
                const touch = e.changedTouches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
                if (target.classList.contains("tile")) {
                    // Create a synthetic MouseEvent from the TouchEvent
                    const mouseEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    });
                    // Override target property by defining it on a new object
                    // that inherits from the MouseEvent
                    const syntheticEvent = Object.create(mouseEvent, {
                        target: { value: target },
                        currentTarget: { value: target }
                    });
                    this.onTileClick(syntheticEvent as MouseEvent);
                }
            }
            const tapLength = currentTime - this.lastTapTime;
            if (tapLength < 500 && tapLength > 0) {
                e.preventDefault(); // prevent double-tap to zoom
            }
            this.lastTapTime = currentTime;
        }

        public set soundEnabled(enabled: boolean) {
            this._soundEnabled = enabled;
            localStorage.setItem("tracer-sound-enabled", this.soundEnabled.toString());
        }

        public get soundEnabled(): boolean {
            return this._soundEnabled;
        }

        public pause(): void {
            this.state = State.Paused;
        }

        public unpause(): void {
            this.state = State.Play;
        }

        private doPlaySound(name: string): void {
            // According to https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode,
            // an `AudioBufferSourceNode` can only be played once; after each call to `start()`,
            // you have to create a new `AudioBufferSourceNode` if you want to play the same sound
            // again.
            const source = this.audioCtx.createBufferSource();
            source.buffer = this.sounds[name].buffer;
            source.connect(this.gainNode);
            source.start();
            this.sounds[name].source = source;
        }

        private playSound(name: string): void {
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

        private stopSound(name: string): void {
            if (this.sounds[name].source) {
                this.sounds[name].source.stop();
            }
        }

        private stopAllSounds(): void {
            for (const name in this.sounds) {
                this.stopSound(name);
            }
        }

        /**
         * Resumes the audio context if it was suspended.
         * This is typically used to resume audio playback after a user interaction,
         * as many browsers require user gesture to start audio playback.
         * 
         * @returns {Promise} A promise that resolves when the audio context has resumed.
         */
        public resumeAudio(): Promise<void> {
            return this.audioCtx.resume();
        }

        /**
         * Initialize audio system for the game.
         * Creates an AudioContext, a gain node to control volume, and 
         * loads all sound files defined in this._sounds from the /sounds/ directory.
         * The volume is set from localStorage if available, otherwise uses the default gain value.
         * Sound files are fetched as MP3s and decoded into audio buffers for playback.
         * @private
         */
        private initAudio(): void {
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

    interface ElementMap {
        game: TracerGame;
        countdown: HTMLElement;
        threeTwoOne: HTMLElement;
        settingsDialog: HTMLDialogElement;
        countdownDialog: HTMLDialogElement;
        splash: HTMLDialogElement;
        won: HTMLDialogElement;
        lost: HTMLDialogElement;
        pause: HTMLDialogElement;
    }

    let el: ElementMap = {} as ElementMap;
    const lang: string = document.location.hostname.startsWith("leuchtspur")
        ? "de"
        : "en";

    function onKeyUp(e: KeyboardEvent) {
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

    function addDifficultyTemplate(parent: HTMLDialogElement, lang: string): void {
        const startGame = (difficulty: number) => {
            parent.close();
            el.game.resumeAudio()
                .then(() => {
                    el.game.difficulty = difficulty;
                    el.game.newGame();
                });
        }
        const template = (document.querySelector(`#difficulty-template-${lang}`) as HTMLTemplateElement).content.cloneNode(true);
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

    function enableSplashScreen(): HTMLDialogElement {
        el.splash = document.querySelector(`#splash-screen-${lang}`) as HTMLDialogElement;
        el.splash.addEventListener("cancel", e => e.preventDefault());
        addDifficultyTemplate(el.splash, lang);
        return el.splash;
    }

    function enableWonDialog(): void {
        el.won = document.querySelector(`#won-dialog-${lang}`) as HTMLDialogElement;
        el.won.addEventListener("cancel", e => e.preventDefault());
        window.addEventListener("wonlevel", e => {
            el.won.showModal();
        });
        addDifficultyTemplate(el.won, lang);
    }

    function enableLostDialog(): void {
        el.lost = document.querySelector(`#lost-dialog-${lang}`) as HTMLDialogElement;
        el.lost.addEventListener("cancel", e => e.preventDefault());
        window.addEventListener("lostlevel", e => {
            el.lost.showModal();
        });
        addDifficultyTemplate(el.lost, lang);
    }

    function enablePauseDialog(): void {
        el.pause = document.querySelector(`#pause-dialog-${lang}`) as HTMLDialogElement;
        const okButton = el.pause.querySelector("button") as HTMLElement;
        okButton.addEventListener("click", e => {
            el.pause.close();
            el.game.unpause();
            e.stopImmediatePropagation();
        });
        window.addEventListener("pause", e => {
            el.pause.showModal();
        });
    }

    function enableCountdownDialog(): void {
        el.countdownDialog = document.querySelector("#countdown-dialog") as HTMLDialogElement;
        el.threeTwoOne = el.countdownDialog.querySelector("div>div") as HTMLElement;
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

    function enableSettingsDialog(): void {
        el.settingsDialog = document.querySelector("#settings-dialog") as HTMLDialogElement;
        window.addEventListener("showsettings", () => {
            el.settingsDialog.showModal();
        });
    }

    function main(): void {
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
        el.game = document.querySelector("tracer-game") as TracerGame;
        el.countdown = document.querySelector("#countdown") as HTMLElement;
        addEventListener("countdown", ((e: Event) => {
            el.countdown.textContent = (e as CustomEvent).detail;
        }) as EventListener);
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

} // namespace Game
