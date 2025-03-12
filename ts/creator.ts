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
function rotateCW(matrix: number[][], eightsTurns = 1) {
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
        matrix = result.map(row => [...row]);
    }
    return matrix;
}

function createPath(level: TransferableLevelData): { dt: number, numTries: number, path: TilePosition[] } {
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
            // Get positions of all neighboring cells
            const allDestinations: Destination = Object.fromEntries(Object.entries(DirectionDelta)
                .map(([direction, move]) => [direction, { x: current.x + move.dx, y: current.y + move.dy }]));
            // Filter out invalid destinations
            const possibleDestinations: Destination = Object.fromEntries(Object.entries(allDestinations)
                // stay within the bounds of the grid
                .filter(([_, dst]) =>
                    dst.x >= 0 && dst.x < level.width &&
                    dst.y >= 0 && dst.y < level.height
                )
                // only consider unvisited cells
                .filter(([_, dst]) => !visited[dst.y][dst.x]));

            // Filter out moves that would create crossings unless crossing is allowed
            const validDestinations: Destination = level.crossingAllowed
                ? possibleDestinations
                : Object.fromEntries(Object.entries(possibleDestinations).filter(([_, dst]) => {
                    if (dst.x !== current.x && dst.y !== current.y) {
                        const corner1 = { x: current.x, y: dst.y };
                        const corner2 = { x: dst.x, y: current.y };
                        if (visited[corner1.y][corner1.x] && visited[corner2.y][corner2.x])
                            return false;
                    }
                    return true;
                }));
            if (Object.keys(validDestinations).length === 0)
                break;

            // Rotate probability matrix to align current direction to "north"
            let weights = level.directionWeights.map(row => [...row]);
            weights = rotateCW(weights, WeightTableTurns[currentDirection]);

            // Calculate the total weight of all valid moves.
            // We'll use this to normalize our random selection.
            const totalWeight: number = Object.values(validDestinations).reduce((sum, move) =>
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
            for (const [direction, move] of Object.entries(validDestinations)) {
                // Calculate the relative direction from current position
                const dx: number = move.x - current.x;
                const dy: number = move.y - current.y;
                // Get the probability for this move from the probability matrix
                const weight: number = weights[dy + 1][dx + 1];

                // Skip forbidden turns
                if (level.forbiddenTurns?.[currentDirection]?.has(direction))
                    continue;

                // Add this probability to our running sum
                cumulativeWeight += weight;

                // If our random number falls within this probability range, select this direction
                if (randomNumber <= cumulativeWeight) {
                    nextDirection = direction;
                    visited[move.y][move.x] = true;
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
    } while (current.y > 0 || ((level.numStepsRequired && path.length !== level.numStepsRequired)));
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
