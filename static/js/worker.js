// build/worker.js
var DirectionDelta = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
  NE: { dx: 1, dy: -1 },
  NW: { dx: -1, dy: -1 },
  SE: { dx: 1, dy: 1 },
  SW: { dx: -1, dy: 1 }
};
Object.freeze(DirectionDelta);
var WeightTableTurns = { NE: 7, E: 6, SE: 5, S: 4, SW: 3, W: 2, NW: 1, N: 0 };
Object.freeze(WeightTableTurns);
function rotateCCW(matrix, eightsTurns = 1) {
  let result = matrix;
  for (let turn = 0; turn < eightsTurns; ++turn) {
    const rotated = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    rotated[1][1] = result[1][1];
    rotated[0][0] = result[0][1];
    rotated[0][1] = result[0][2];
    rotated[0][2] = result[1][2];
    rotated[1][2] = result[2][2];
    rotated[2][2] = result[2][1];
    rotated[2][1] = result[2][0];
    rotated[2][0] = result[1][0];
    rotated[1][0] = result[0][0];
    result = rotated;
  }
  return result;
}
function createPath(level) {
  const MAX_ATTEMPTS = 1e6;
  const t0 = performance.now();
  let path;
  let current = { x: 0, y: 0 };
  let numTries = 0;
  do {
    ++numTries;
    const visited = Array.from({ length: level.height }, () => Array(level.width).fill(false));
    current.x = Math.floor(Math.random() * level.width);
    current.y = level.height - 1;
    visited[current.y][current.x] = true;
    path = [{ ...current }];
    let currentDirection = "N";
    while (current.y > 0) {
      let validDestinations = Object.entries(DirectionDelta).map(([direction, move]) => [direction, { x: current.x + move.dx, y: current.y + move.dy }]).filter(([direction, dst]) => {
        var _a, _b;
        return dst.x >= 0 && dst.x < level.width && dst.y >= 0 && dst.y < level.height && !visited[dst.y][dst.x] && !((_b = (_a = level.forbiddenTurns) === null || _a === void 0 ? void 0 : _a[currentDirection]) === null || _b === void 0 ? void 0 : _b.has(direction));
      });
      validDestinations = level.crossingAllowed ? validDestinations : validDestinations.filter(([_, dst]) => {
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
      let weights = level.directionWeights.map((row) => [...row]);
      weights = rotateCCW(weights, WeightTableTurns[currentDirection]);
      const totalWeight = validDestinations.reduce((sum, [_, move]) => sum + weights[move.y - current.y + 1][move.x - current.x + 1], 0);
      if (totalWeight === 0)
        break;
      const randomNumber = Math.random() * totalWeight;
      let cumulativeWeight = 0;
      let nextDirection = "";
      for (const [direction, dst] of validDestinations) {
        const dx = dst.x - current.x;
        const dy = dst.y - current.y;
        const weight = weights[dy + 1][dx + 1];
        cumulativeWeight += weight;
        if (randomNumber <= cumulativeWeight) {
          nextDirection = direction;
          visited[dst.y][dst.x] = true;
          break;
        }
      }
      if (nextDirection === "")
        break;
      current.x += DirectionDelta[nextDirection].dx;
      current.y += DirectionDelta[nextDirection].dy;
      path.push({ ...current });
      currentDirection = nextDirection;
    }
  } while ((current.y > 0 || path.length !== level.numStepsRequired) && numTries < MAX_ATTEMPTS);
  return { dt: performance.now() - t0, numTries, path };
}
onmessage = (e) => {
  const result = createPath(e.data);
  postMessage(result);
};
onerror = (e) => {
  console.error(e);
};
onmessageerror = (e) => {
  console.error(e);
};
