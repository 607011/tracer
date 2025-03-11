// build/creator.js
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
function rotateCW(matrix, eightsTurns = 1) {
  const result = Array.from({ length: 3 }, () => Array(3).fill(0));
  result[1][1] = matrix[1][1];
  for (let turn = 0; turn < eightsTurns; ++turn) {
    result[0][2] = matrix[0][1];
    result[0][1] = matrix[0][0];
    result[2][0] = matrix[2][1];
    result[2][1] = matrix[2][2];
    result[2][2] = matrix[1][2];
    result[1][2] = matrix[0][2];
    result[0][0] = matrix[1][0];
    result[1][0] = matrix[2][0];
    matrix = result.map((row) => [...row]);
  }
  return matrix;
}
function createPath(level) {
  var _a, _b;
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
      const allDestinations = Object.fromEntries(Object.entries(DirectionDelta).map(([direction, move]) => [direction, { x: current.x + move.dx, y: current.y + move.dy }]));
      const possibleDestinations = Object.fromEntries(Object.entries(allDestinations).filter(([_, dst]) => dst.x >= 0 && dst.x < level.width && dst.y >= 0 && dst.y < level.height).filter(([_, dst]) => !visited[dst.y][dst.x]));
      const validDestinations = level.crossingAllowed ? possibleDestinations : Object.fromEntries(Object.entries(possibleDestinations).filter(([_, dst]) => {
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
      let weights = level.directionWeights.map((row) => [...row]);
      weights = rotateCW(weights, WeightTableTurns[currentDirection]);
      const totalWeight = Object.values(validDestinations).reduce((sum, move) => sum + weights[move.y - current.y + 1][move.x - current.x + 1], 0);
      if (totalWeight === 0)
        break;
      const randomNumber = Math.random() * totalWeight;
      let cumulativeWeight = 0;
      let nextDirection = "";
      for (const [direction, move] of Object.entries(validDestinations)) {
        const dx = move.x - current.x;
        const dy = move.y - current.y;
        const weight = weights[dy + 1][dx + 1];
        if ((_b = (_a = level.forbiddenTurns) === null || _a === void 0 ? void 0 : _a[currentDirection]) === null || _b === void 0 ? void 0 : _b.includes(direction))
          continue;
        cumulativeWeight += weight;
        if (randomNumber <= cumulativeWeight) {
          nextDirection = direction;
          visited[move.y][move.x] = true;
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
  } while (current.y > 0 || level.numStepsRequired && path.length !== level.numStepsRequired);
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
