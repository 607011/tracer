import { TransferableLevelData, TilePosition } from "./types.js";

namespace Game {

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
        /** Required number of steps in the path */
        numStepsRequired: number;
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
        directionWeights: number[][];
        /** 
         * Map of directions to arrays of forbidden turn directions
         * For example, forbiddenTurns.N contains directions that can't be turned to from North
         */
        forbiddenTurns?: Record<string, string[]>;
        /** Whether the path is allowed to cross itself */
        crossingAllowed: boolean;
        animationStyle: AnimationStyle;
    }


    const DefaultDirectionWeights: number[][] = [
        // NW   N    NE
        //  W   X    E
        // SW   S    SE
        [1, 1, 1],
        [1, 0, 1],
        [1, 0, 1],
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

    enum AnimationStyle {
        Fluid,
        Step,
        Path
    }


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
        Start,
        Lost,
    }

    /**
     * Return a `Promise` that resolves after the specified delay
     * @param ms delay in milliseconds
     * Return a `Promise` that resolves after the specified delay
     * @param ms delay in milliseconds
     * @returns {Promise} Promise that resolves after the delay
     */
    function delay(ms: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
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
                directionWeights: [
                    [0, 1, 0],
                    [1, 0, 1],
                    [0, 0, 0],
                ],
                forbiddenTurns: DefaultForbiddenTurns,
                width: 4,
                height: 4,
                secsToSolve: 20,
                tileAnimationDurationSecs: 3,
                numStepsRequired: 5,
                animationStyle: AnimationStyle.Path,
            },
            {
                crossingAllowed: false,
                directionWeights: DefaultDirectionWeights,
                forbiddenTurns: DefaultForbiddenTurns,
                width: 5,
                height: 4,
                secsToSolve: 30,
                tileAnimationDurationSecs: 2.5,
                numStepsRequired: 6,
                animationStyle: AnimationStyle.Path,
            },
            {
                crossingAllowed: false,
                directionWeights: DefaultDirectionWeights,
                forbiddenTurns: DefaultForbiddenTurns,
                width: 5,
                height: 4,
                secsToSolve: 30,
                tileAnimationDurationSecs: 2.5,
                numStepsRequired: 8,
                animationStyle: AnimationStyle.Path,
            },
            {
                crossingAllowed: false,
                directionWeights: DefaultDirectionWeights,
                forbiddenTurns: DefaultForbiddenTurns,
                width: 5,
                height: 5,
                secsToSolve: 30,
                tileAnimationDurationSecs: 2.3,
                numStepsRequired: 10,
                animationStyle: AnimationStyle.Fluid,
            },
            {
                crossingAllowed: false,
                directionWeights: DefaultDirectionWeights,
                forbiddenTurns: DefaultForbiddenTurns,
                width: 5,
                height: 6,
                secsToSolve: 30,
                tileAnimationDurationSecs: 2.2,
                numStepsRequired: 11,
                animationStyle: AnimationStyle.Fluid,
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
                animationStyle: AnimationStyle.Fluid,
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
                animationStyle: AnimationStyle.Fluid,
            },
            {
                crossingAllowed: false,
                directionWeights: DefaultDirectionWeights,
                forbiddenTurns: DefaultForbiddenTurns,
                width: 8,
                height: 7,
                secsToSolve: 20,
                tileAnimationDurationSecs: 1.5,
                numStepsRequired: 15,
                animationStyle: AnimationStyle.Fluid,
            },
            {
                crossingAllowed: true,
                directionWeights: [
                    [0, 1, 0],
                    [1, 0, 1],
                    [0, 0, 0],
                ],
                forbiddenTurns: DefaultForbiddenTurns,
                width: 9,
                height: 9,
                secsToSolve: 60,
                tileAnimationDurationSecs: 5,
                numStepsRequired: 18,
                animationStyle: AnimationStyle.Path,
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
                animationStyle: AnimationStyle.Path,
            },
            {
                crossingAllowed: true,
                directionWeights: DefaultDirectionWeights,
                width: 11,
                height: 11,
                secsToSolve: 60,
                tileAnimationDurationSecs: 5,
                numStepsRequired: 25,
                animationStyle: AnimationStyle.Path,
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
        private t0: number;

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

        private worker: Worker;
        private pathReadyCallback?: Function;
        public _creatingPath: boolean = false;

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

        private initWorker(): void {
            this.worker = new Worker(`./static/js/creator.js?v=${Date.now()}`, { type: "module" });
            this.worker.onmessage = e => {
                const { dt, numTries, path } = e.data;
                this._creatingPath = false;
                this.path = path;
                this.pathReadyCallback?.call(path);
                console.info(`New path with ${path.length} steps created in ${dt}ms after ${numTries} tries: ${path.map(({ x, y }) => `(${x},${y})`).join(" → ")}`);
            };
            this.worker.onerror = e => {
                console.error(e);
            }
            this.worker.onmessageerror = e => {
                console.error(e);
            }
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
            if (difficulty === this.difficulty && this.path.length > 0) {
                this.pathReadyCallback?.(this.path);
                return;
            }
            this.level = TracerGame.Levels[Math.min(difficulty, TracerGame.Levels.length - 1)];
            this.updateDynamicStyles();
            this.buildBoard();
            this.createPath();
        }

        public get difficulty(): number {
            return Math.max(0, TracerGame.Levels.indexOf(this.level));
        }

        public get creatingPath(): boolean {
            return this._creatingPath;
        }

        /**
         * Animate the path on the game board by adding the "path" class to
         * each tile in the path which triggers a CSS animation.
         */
        private animatePath(): void {
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

        /**
         * Randomly generate a path for the game, beginning at the bottom row and
         * working its way to the top row. The path must have a minimum number of steps
         * and turns as defined in the level data.
         */
        public createPath(): void {
            console.debug("createPath()", this._creatingPath);
            if (this._creatingPath)
                return;
            const levelData: TransferableLevelData = {
                width: this.level.width,
                height: this.level.height,
                numStepsRequired: this.level.numStepsRequired,
                directionWeights: this.level.directionWeights,
                forbiddenTurns: this.level.forbiddenTurns,
                crossingAllowed: this.level.crossingAllowed,
            };
            this._creatingPath = true;
            this.worker.postMessage(levelData);
        }

        public registerPathReadyCallback(callback: Function): void {
            this.pathReadyCallback = callback;
        }

        public unregisterPathReadyCallback(): void {
            this.pathReadyCallback = undefined;
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
                        this.tiles.flat().forEach(tile => tile.classList.remove("path", "step"));
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
                    cancelAnimationFrame(this.animationFrameID);
                    this.board.classList.add("locked");
                    this.playSound("tada");
                    this.tiles.flat().forEach(tile => tile.classList.remove("visited"));
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
                    this.tiles.flat().forEach(tile => tile.classList.remove("visited", "path", "step"));
                    this.createPath();
                    dispatchEvent(new CustomEvent("lostlevel"));
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

        public lose(): void {
            this.state = State.Lost;
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
            case "x":
                el.game.lose();
                break;
            default:
                break;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    function addDifficultyTemplate(parent: HTMLDialogElement, lang: string): void {
        const difficultyButtons: HTMLButtonElement[] = [];
        const startGame = (difficulty: number) => {
            const doStartGame = () => {
                parent.close();
                difficultyButtons[el.game.difficulty].disabled = false;
                el.game.newGame();
            };
            el.game.registerPathReadyCallback(function pathReadyCallback(_path: TilePosition[]) {
                if (el.game.creatingPath) {
                    el.game.registerPathReadyCallback(doStartGame);
                }
                else {
                    el.game.unregisterPathReadyCallback();
                    doStartGame();
                }
            });
            el.game.resumeAudio()
                .then(() => {
                    // setting the difficulty will trigger the path creation
                    el.game.difficulty = difficulty;
                });
        }
        const difficultyTemplate = (document.querySelector(`#difficulty-template-${lang}`) as HTMLTemplateElement).content.cloneNode(true);
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
        const loaderIcon = (document.querySelector(`#loader-icon`) as HTMLTemplateElement).content.cloneNode(true);
        parent.addEventListener("keydown", e => {
            if ("1" <= e.key && e.key <= `${el.game.levelCount}`) {
                const difficulty = parseInt(e.key) - 1;
                startGame(difficulty);
                difficultyButtons[difficulty].disabled = true;
                difficultyButtons[difficulty].replaceChildren(loaderIcon);
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        });
        parent.addEventListener("click", e => {
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
