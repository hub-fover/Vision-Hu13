/** Shared quadrilateral and projective geometry. */

const MAX_CONDITION = 1e8;
const MAX_REPROJECTION_ERROR = 0.5;
const PARALLEL_EPSILON = 1e-10;

export class GeometryError extends Error {
  constructor(code) {
    super(code);
    this.name = "GeometryError";
    this.code = code;
  }
}

function points(value, errorCode = "NON_CONVEX") {
  if (!Array.isArray(value) || value.length !== 4 ||
      value.some((point) => !Array.isArray(point) || point.length !== 2 ||
        point.some((coordinate) => !Number.isFinite(coordinate)))) {
    throw new GeometryError(errorCode);
  }
  return value.map((point) => point.map(Number));
}

function signedArea(quad) {
  return quad.reduce((sum, point, index) => {
    const next = quad[(index + 1) % 4];
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0) / 2;
}

export function orderQuad(value) {
  let quad = points(value);
  const center = quad.reduce((sum, point) =>
    [sum[0] + point[0] / 4, sum[1] + point[1] / 4], [0, 0]);
  quad.sort((a, b) =>
    Math.atan2(a[1] - center[1], a[0] - center[0]) -
    Math.atan2(b[1] - center[1], b[0] - center[0]));
  if (signedArea(quad) < 0) quad.reverse();
  const start = quad.reduce((best, point, index) =>
    point[0] + point[1] < quad[best][0] + quad[best][1] ? index : best, 0);
  return quad.slice(start).concat(quad.slice(0, start));
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 &&
    orientation(c, d, a) * orientation(c, d, b) < 0;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function validateQuad(value, width, height) {
  const quad = points(value);
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      !(width > 0 && height > 0) ||
      quad.some(([x, y]) => x < 0 || y < 0 || x > width || y > height)) {
    throw new GeometryError("OUT_OF_BOUNDS");
  }
  const minimumDistance = Math.max(4, 0.002 * Math.hypot(width, height));
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      if (distance(quad[i], quad[j]) < minimumDistance) {
        throw new GeometryError("DUPLICATE_POINTS");
      }
    }
  }
  if (segmentsCross(quad[0], quad[1], quad[2], quad[3]) ||
      segmentsCross(quad[1], quad[2], quad[3], quad[0])) {
    throw new GeometryError("SELF_INTERSECTION");
  }
  const edges = quad.map((point, index) => distance(point, quad[(index + 1) % 4]));
  const crosses = quad.map((point, index) =>
    orientation(point, quad[(index + 1) % 4], quad[(index + 2) % 4]));
  if (crosses.some((cross, index) =>
    Math.abs(cross) / (edges[index] * edges[(index + 1) % 4]) < 0.001)) {
    throw new GeometryError("NEAR_COLLINEAR");
  }
  if (!(crosses.every((cross) => cross > 0) || crosses.every((cross) => cross < 0))) {
    throw new GeometryError("NON_CONVEX");
  }
  if (Math.abs(signedArea(quad)) < Math.max(256, 0.001 * width * height)) {
    throw new GeometryError("AREA_TOO_SMALL");
  }
  if (Math.min(...edges) / Math.max(...edges) < 0.02) {
    throw new GeometryError("TOO_SLENDER");
  }
  return orderQuad(quad);
}

function normalize(quad) {
  const center = quad.reduce((sum, point) =>
    [sum[0] + point[0] / 4, sum[1] + point[1] / 4], [0, 0]);
  const rms = Math.sqrt(quad.reduce((sum, point) =>
    sum + ((point[0] - center[0]) ** 2 + (point[1] - center[1]) ** 2) / 4, 0));
  if (rms <= Number.EPSILON) throw new GeometryError("SINGULAR_HOMOGRAPHY");
  const scale = Math.SQRT2 / rms;
  return {
    points: quad.map(([x, y]) => [(x - center[0]) * scale, (y - center[1]) * scale]),
    transform: [[scale, 0, -scale * center[0]], [0, scale, -scale * center[1]], [0, 0, 1]],
  };
}

function infinityNorm(matrix) {
  return Math.max(...matrix.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)));
}

function inverse(matrix) {
  const size = matrix.length;
  const work = matrix.map((row, index) => [...row,
    ...Array.from({ length: size }, (_, column) => Number(index === column))]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (Math.abs(work[pivot][column]) <= 1e-12) {
      throw new GeometryError("SINGULAR_HOMOGRAPHY");
    }
    [work[column], work[pivot]] = [work[pivot], work[column]];
    const divisor = work[column][column];
    work[column] = work[column].map((value) => value / divisor);
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = work[row][column];
      work[row] = work[row].map((value, index) => value - factor * work[column][index]);
    }
  }
  return work.map((row) => row.slice(size));
}

function multiply(left, right) {
  return left.map((row) => right[0].map((_, column) =>
    row.reduce((sum, value, index) => sum + value * right[index][column], 0)));
}

function transformInverse(transform) {
  const scale = transform[0][0];
  return [[1 / scale, 0, -transform[0][2] / scale],
    [0, 1 / scale, -transform[1][2] / scale], [0, 0, 1]];
}

export function computeHomography(sourceValue, destinationValue) {
  const sourceOriginal = points(sourceValue, "SINGULAR_HOMOGRAPHY");
  const destinationOriginal = points(destinationValue, "SINGULAR_HOMOGRAPHY");
  const source = normalize(sourceOriginal);
  const destination = normalize(destinationOriginal);
  const matrix = [];
  const values = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = source.points[i];
    const [u, v] = destination.points[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(u, v);
  }
  const matrixInverse = inverse(matrix);
  if (infinityNorm(matrix) * infinityNorm(matrixInverse) > MAX_CONDITION) {
    throw new GeometryError("SINGULAR_HOMOGRAPHY");
  }
  const solution = matrixInverse.map((row) =>
    row.reduce((sum, value, index) => sum + value * values[index], 0));
  const normalizedH = [solution.slice(0, 3), solution.slice(3, 6), [...solution.slice(6), 1]];
  let homography = multiply(
    multiply(transformInverse(destination.transform), normalizedH), source.transform);
  const divisor = homography[2][2];
  if (Math.abs(divisor) <= Number.EPSILON) throw new GeometryError("SINGULAR_HOMOGRAPHY");
  homography = homography.map((row) => row.map((value) => value / divisor));
  const errors = sourceOriginal.map(([x, y], index) => {
    const w = homography[2][0] * x + homography[2][1] * y + homography[2][2];
    const projected = [(homography[0][0] * x + homography[0][1] * y + homography[0][2]) / w,
      (homography[1][0] * x + homography[1][1] * y + homography[1][2]) / w];
    return distance(projected, destinationOriginal[index]);
  });
  if (errors.some((error) => !Number.isFinite(error)) ||
      Math.max(...errors) > MAX_REPROJECTION_ERROR) {
    throw new GeometryError("SINGULAR_HOMOGRAPHY");
  }
  return homography;
}

function intersection(a, b, c, d) {
  const line = (p, q) => [
    p[1] - q[1], q[0] - p[0], p[0] * q[1] - p[1] * q[0],
  ];
  const first = line(a, b);
  const second = line(c, d);
  const result = [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
  if (Math.abs(result[2]) <= PARALLEL_EPSILON *
      Math.max(1, Math.abs(result[0]), Math.abs(result[1]))) return null;
  return [result[0] / result[2], result[1] / result[2]];
}

export function computeVanishingPoints(value) {
  const quad = points(value);
  return [
    intersection(quad[0], quad[1], quad[3], quad[2]),
    intersection(quad[0], quad[3], quad[1], quad[2]),
  ];
}

function homogeneousLine(a, b) {
  return [a[1] - b[1], b[0] - a[0], a[0] * b[1] - a[1] * b[0]];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function canonicalDirection(value, reference) {
  const norm = Math.hypot(...value);
  if (norm <= Number.EPSILON) return [0, 0];
  let direction = value.map((coordinate) => coordinate / norm);
  if (direction[0] * reference[0] + direction[1] * reference[1] < 0) {
    direction = direction.map((coordinate) => -coordinate);
  }
  return direction;
}

function unitDirection(value) {
  const norm = Math.hypot(...value);
  if (norm <= Number.EPSILON) return [0, 0];
  return value.map((coordinate) => coordinate / norm);
}

function edgeAnchor(center, direction, width, height) {
  const candidates = [];
  if (Math.abs(direction[0]) > Number.EPSILON) {
    const boundaryX = direction[0] > 0 ? width : 0;
    candidates.push((boundaryX - center[0]) / direction[0]);
  }
  if (Math.abs(direction[1]) > Number.EPSILON) {
    const boundaryY = direction[1] > 0 ? height : 0;
    candidates.push((boundaryY - center[1]) / direction[1]);
  }
  const amount = Math.min(...candidates.filter((value) => value >= 0));
  return [
    Math.min(width, Math.max(0, center[0] + direction[0] * amount)),
    Math.min(height, Math.max(0, center[1] + direction[1] * amount)),
  ];
}

function clipLine(coefficients, width, height) {
  const [a, b, c] = coefficients;
  const candidates = [];
  const add = (x, y) => {
    const tolerance = 1e-9;
    if (x < -tolerance || x > width + tolerance ||
        y < -tolerance || y > height + tolerance) return;
    const point = [Math.min(width, Math.max(0, x)), Math.min(height, Math.max(0, y))];
    if (!candidates.some((existing) => distance(existing, point) <= tolerance)) {
      candidates.push(point);
    }
  };
  if (Math.abs(b) > Number.EPSILON) {
    add(0, -c / b);
    add(width, -(a * width + c) / b);
  }
  if (Math.abs(a) > Number.EPSILON) {
    add(-c / a, 0);
    add(-(b * height + c) / a, height);
  }
  if (candidates.length < 2) return null;
  let best = null;
  candidates.forEach((first, index) => {
    candidates.slice(index + 1).forEach((second) => {
      if (!best || distance(first, second) > distance(best[0], best[1])) {
        best = [first, second];
      }
    });
  });
  return best;
}

export function computePerspectiveGuide(value, viewportSize) {
  const quad = points(value);
  if (!Array.isArray(viewportSize) || viewportSize.length !== 2 ||
      viewportSize.some((coordinate) => !Number.isFinite(coordinate) || coordinate <= 0)) {
    throw new GeometryError("OUT_OF_BOUNDS");
  }
  const [width, height] = viewportSize.map(Number);
  const center = [width / 2, height / 2];
  const diagonal = Math.hypot(width, height);
  const families = [
    { family: "u", first: [0, 1], second: [3, 2] },
    { family: "v", first: [0, 3], second: [1, 2] },
  ];
  const homogeneousPoints = [];
  const directions = families.map(({ family, first, second }) => {
    const homogeneous = cross3(
      homogeneousLine(quad[first[0]], quad[first[1]]),
      homogeneousLine(quad[second[0]], quad[second[1]]));
    homogeneousPoints.push(homogeneous);
    const reference = [
      quad[first[1]][0] - quad[first[0]][0] +
        quad[second[1]][0] - quad[second[0]][0],
      quad[first[1]][1] - quad[first[0]][1] +
        quad[second[1]][1] - quad[second[0]][1],
    ];
    const scale = Math.max(1, Math.abs(homogeneous[0]), Math.abs(homogeneous[1]));
    if (Math.abs(homogeneous[2]) <= PARALLEL_EPSILON * scale) {
      return {
        family,
        status: "parallel",
        point: null,
        direction: canonicalDirection(homogeneous.slice(0, 2), reference),
        edge_anchor: null,
        distance_diagonals: null,
      };
    }

    const point = homogeneous.slice(0, 2).map((coordinate) =>
      coordinate / homogeneous[2]);
    const vector = [point[0] - center[0], point[1] - center[1]];
    const direction = unitDirection(vector);
    const onscreen = point[0] >= 0 && point[0] <= width &&
      point[1] >= 0 && point[1] <= height;
    return {
      family,
      status: onscreen ? "onscreen" : "offscreen",
      point,
      direction,
      edge_anchor: onscreen ? null : edgeAnchor(center, direction, width, height),
      distance_diagonals: onscreen ? null : Math.hypot(...vector) / diagonal,
    };
  });

  let line = cross3(homogeneousPoints[0], homogeneousPoints[1]);
  const lineNorm = Math.hypot(line[0], line[1]);
  let vanishingLine;
  if (lineNorm <= Number.EPSILON) {
    vanishingLine = { status: "infinite", coefficients: [0, 0, 1], segment: null };
  } else {
    line = line.map((coordinate) => coordinate / lineNorm);
    if (line[0] < -Number.EPSILON ||
        (Math.abs(line[0]) <= Number.EPSILON && line[1] < 0)) {
      line = line.map((coordinate) => -coordinate);
    }
    const segment = clipLine(line, width, height);
    vanishingLine = {
      status: segment ? "visible" : "offscreen",
      coefficients: line,
      segment,
    };
  }
  return { directions, vanishing_line: vanishingLine };
}
