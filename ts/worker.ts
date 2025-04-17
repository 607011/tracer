import { TilePosition, TransferableLevelData } from "./types.js";

interface Move {
    dx: number;
    dy: number;
}

interface Destination {
    [direction: string]: TilePosition;
}

/**
 * Enumeration of possible directions in the Tracer game.
 */
const DirectionDelta: { [direction: string]: Move } = {
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
const WeightTableTurns: { [direction: string]: number } = { NE: 7, E: 6, SE: 5, S: 4, SW: 3, W: 2, NW: 1, N: 0 };
Object.freeze(WeightTableTurns);

/**
  * Turn 3x3 `matrix` in `eightsTurns` 45-degree steps clockwise.
  */
function rotateCCW(matrix: number[][], eightsTurns: number = 1): number[][] {
    let result = matrix;
    for (let turn = 0; turn < eightsTurns; ++turn) {
        const rotated = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        rotated[1][1] = result[1][1]; // center stays the same
        rotated[0][0] = result[0][1]; // NW gets N
        rotated[0][1] = result[0][2]; // N gets NE
        rotated[0][2] = result[1][2]; // NE gets E
        rotated[1][2] = result[2][2]; // E gets SE
        rotated[2][2] = result[2][1]; // SE gets S
        rotated[2][1] = result[2][0]; // S gets SW
        rotated[2][0] = result[1][0]; // SW gets W
        rotated[1][0] = result[0][0]; // W gets NW
        result = rotated;
    }
    return result;
}

type PathResult = {
    dt: number;       // Time taken to compute the path in milliseconds
    numTries: number; // Number of attempts made to find a valid path
    path: TilePosition[]; // The resulting path consisting of tile positions
};

function createPath(level: TransferableLevelData): PathResult {
    const MAX_ATTEMPTS = 1_000_000;
    const t0: number = performance.now();
    let path: TilePosition[];
    let current: TilePosition = { x: 0, y: 0 };
    let numTries: number = 0;
    do {
        ++numTries;
        const visited: boolean[][] = Array.from({ length: level.height }, () => Array(level.width).fill(false));
        // First position is at the bottom row in a random column
        current.x = Math.floor(Math.random() * level.width);
        current.y = level.height - 1;
        visited[current.y][current.x] = true;
        path = [{ ...current }];
        // Choose a random direction to start with
        let currentDirection: string = "N";
        // While we haven't reached the top row ...
        while (current.y > 0) {
            // Filter out invalid destinations
            let validDestinations = Object.entries(DirectionDelta)
                .map(([direction, move]) =>
                    [direction, { x: current.x + move.dx, y: current.y + move.dy }] as [string, TilePosition])
                .filter(([direction, dst]) =>
                    // stay within the bounds of the grid
                    dst.x >= 0 && dst.x < level.width &&
                    dst.y >= 0 && dst.y < level.height &&
                    // only consider unvisited cells
                    !visited[dst.y][dst.x] &&
                    // remove forbidden turns
                    !(level.forbiddenTurns?.[currentDirection]?.has(direction))
                );
            // Filter out moves that would create crossings unless crossing is allowed
            validDestinations = level.crossingAllowed
                ? validDestinations
                : validDestinations.filter(([_, dst]) => {
                    if (dst.x !== current.x && dst.y !== current.y) {
                        const corner1 = { x: current.x, y: dst.y };
                        const corner2 = { x: dst.x, y: current.y };
                        if (visited[corner1.y][corner1.x] && visited[corner2.y][corner2.x])
                            return false;
                    }
                    return true;
                });
            if (validDestinations.length === 0)
                break;
            // Rotate probability matrix to align current direction to "north"
            let weights = level.directionWeights.map(row => [...row]);
            weights = rotateCCW(weights, WeightTableTurns[currentDirection]);
            // Calculate the total weight of all valid moves.
            // We'll use this to normalize our random selection.
            const totalWeight: number = validDestinations.reduce((sum, [_, move]) =>
                // +1 to indices because the matrix is 0-indexed but coordinates are -1, 0, 1
                sum + weights[move.y - current.y + 1][move.x - current.x + 1]
                , 0);
            if (totalWeight === 0)
                break;
            // Generate random number within range of total probability
            const randomNumber: number = Math.random() * totalWeight;
            let cumulativeWeight: number = 0;
            let nextDirection: string = "";
            // Iterate through each possible destination
            for (const [direction, dst] of validDestinations) {
                // Calculate the relative direction from current position
                const dx: number = dst.x - current.x;
                const dy: number = dst.y - current.y;
                // Get the probability for this move from the probability matrix
                const weight: number = weights[dy + 1][dx + 1];
                // Add this probability to our running sum
                cumulativeWeight += weight;
                // If our random number falls within this probability range, select this direction
                if (randomNumber <= cumulativeWeight) {
                    nextDirection = direction;
                    visited[dst.y][dst.x] = true;
                    break;
                }
            }
            // If no valid direction was found, break out and regenerate path
            if (nextDirection === "")
                break;
            // Advance to the next position in the path
            current.x += DirectionDelta[nextDirection].dx;
            current.y += DirectionDelta[nextDirection].dy;
            path.push({ ...current });
            currentDirection = nextDirection;
        }
    } while ((current.y > 0 || path.length !== level.numStepsRequired) && numTries < MAX_ATTEMPTS);
    return { dt: performance.now() - t0, numTries, path };
}

onmessage = (e: MessageEvent<TransferableLevelData>) => {
    const result = createPath(e.data);
    postMessage(result);
};

onerror = e => {
    console.error(e);
}

onmessageerror = e => {
    console.error(e);
}
