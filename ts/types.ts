/**
 * Interface representing the level data passed to the worker
 */
export interface TransferableLevelData {
    width: number;
    height: number;
    numStepsRequired: number;
    directionWeights: number[][];
    forbiddenTurns?: Record<string, Set<string>>;
    crossingAllowed: boolean;
}


/**
 * Interface representing a tile position in the game path
 */
export interface TilePosition {
    x: number;
    y: number;
}


export interface PathResult {
    dt: number;       // Time taken to compute the path in milliseconds
    numTries: number; // Number of attempts made to find a valid path
    path: TilePosition[]; // The resulting path consisting of tile positions
}
