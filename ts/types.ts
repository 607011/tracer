/**
 * Enumeration of possible directions in the Tracer game.
 */
export const DirectionDelta = {
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

/**
 * How many 45-degree turns are required to align the current direction with the "north" direction.
 */
export const ProbTableTurns = { NE: 7, E: 6, SE: 5, S: 4, SW: 3, W: 2, NW: 1, N: 0 };
Object.freeze(ProbTableTurns);

export interface TransferableLevelData {
    width: number;
    height: number;
    numStepsRequired: number;
    directionWeights: number[][];
    forbiddenTurns: Record<string, string[]>;
    crossingAllowed: boolean;
}

/**
 * Type definition for level data configuration
 */
export interface LevelData {
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
    forbiddenTurns: Record<string, string[]>;
    /** Whether the path is allowed to cross itself */
    crossingAllowed: boolean;
    animationStyle: AnimationStyle;
}

export const DefaultDirectionProbs: number[][] = [
    // NW   N    NE
    //  W   X    E
    // SW   S    SE
    [0.08, 1.42, 0.08],
    [0.28, 0.00, 0.28],
    [1.10, 0.00, 1.10],
];

export const DefaultForbiddenTurns: Record<string, string[]> = {
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
export interface TilePosition {
    x: number;
    y: number;
}

export enum AnimationStyle {
    Fluid,
    Step,
    Path
}

