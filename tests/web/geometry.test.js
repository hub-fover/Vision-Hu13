import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GeometryError, computeHomography, computeVanishingPoints, orderQuad, validateQuad,
} from "../../web/js/geometry.js";

const root = new URL("../../", import.meta.url);
const geometryFixtures = JSON.parse(
  await readFile(new URL("shared/fixtures/geometry.json", root), "utf8"));

function permutations(values) {
  if (!values.length) return [[]];
  return values.flatMap((value, index) => {
    const rest = values.slice(0, index).concat(values.slice(index + 1));
    return permutations(rest).map((tail) => [value, ...tail]);
  });
}

function close(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    if (Array.isArray(value)) close(value, expected[index], tolerance);
    else assert.ok(Math.abs(value - expected[index]) <= tolerance);
  });
}

function project(matrix, [x, y]) {
  const w = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2];
  return [(matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]) / w,
    (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]) / w];
}

function fixtureNumber(value) {
  if (value === "NaN") return Number.NaN;
  if (value === "Infinity") return Number.POSITIVE_INFINITY;
  return value;
}

test("shared contract fixtures load", async () => {
  const errors = JSON.parse(await readFile(new URL("shared/errors.json", root), "utf8"));
  const presets = JSON.parse(await readFile(new URL("shared/presets.json", root), "utf8"));
  assert.equal(Object.keys(errors).length, 8);
  assert.equal(presets.geometry.maximumNormalizedHomographyCondition, 100_000_000);
  assert.equal(geometryFixtures.ordering.name, "skewed-quadrilateral");
  assert.equal(geometryFixtures.validationErrors.length, 9);
  assert.equal(geometryFixtures.invalidHomographies.length, 3);
});

test("orderQuad handles every random order", () => {
  const expected = geometryFixtures.ordering.ordered;
  for (const permutation of permutations(expected)) close(orderQuad(permutation), expected);
});

for (const geometryCase of geometryFixtures.validationErrors) {
  test(`validateQuad reports ${geometryCase.code}`, () => {
    const canvas = geometryCase.canvas.map(fixtureNumber);
    assert.throws(() => validateQuad(geometryCase.points, ...canvas),
      (error) => error instanceof GeometryError && error.code === geometryCase.code);
  });
}

test("validateQuad returns TL,TR,BR,BL", () => {
  const geometryCase = geometryFixtures.ordering;
  close(validateQuad(geometryCase.ordered, ...geometryCase.canvas), geometryCase.ordered);
});

for (const geometryCase of geometryFixtures.homographies) {
  test(`computeHomography ${geometryCase.name}`, () => {
    const matrix = computeHomography(geometryCase.source, geometryCase.destination);
    close(matrix, geometryCase.expected);
    geometryCase.source.forEach((point, index) =>
      close(project(matrix, point), geometryCase.destination[index], 0.5));
    if (geometryCase.requiresPerspective) {
      assert.ok(Math.abs(matrix[2][0]) > 1e-12 || Math.abs(matrix[2][1]) > 1e-12);
    }
  });
}

test("computeHomography rejects singular input", () => {
  const geometryCase = geometryFixtures.singularHomography;
  assert.throws(() => computeHomography(
    geometryCase.source, geometryCase.destination),
  (error) => error instanceof GeometryError && error.code === geometryCase.code);
});

for (const geometryCase of geometryFixtures.invalidHomographies) {
  test(`computeHomography rejects ${geometryCase.name}`, () => {
    assert.throws(() => computeHomography(
      geometryCase.source, geometryCase.destination),
    (error) => error instanceof GeometryError && error.code === geometryCase.code);
  });
}

for (const geometryCase of geometryFixtures.vanishingPoints) {
  test(`computeVanishingPoints ${geometryCase.name}`, () => {
    const actual = computeVanishingPoints(geometryCase.quad);
    actual.forEach((point, index) => {
      const expected = geometryCase.expected[index];
      if (expected === null) assert.equal(point, null);
      else close(point, expected);
    });
  });
}
