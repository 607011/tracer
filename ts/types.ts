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
