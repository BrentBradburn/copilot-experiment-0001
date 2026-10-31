import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeTime, pointAt, zoomAt, renderPixels, palettes, destinations, INITIAL_SPAN, MIN_SPAN } from './mandelbrot.js';

test('known interior points remain bounded and exterior points escape', () => {
  for (const [x, y] of [[0, 0], [-1, 0], [-0.5, 0.5]]) assert.equal(escapeTime(x, y, 240), -1);
  for (const [x, y] of [[1, 1], [2, 0], [-2, 1]]) assert.ok(escapeTime(x, y, 240) > 0);
});

test('coordinate mapping respects aspect ratio and imaginary axis orientation', () => {
  const view = { x: -0.5, y: 0, span: 4 };
  assert.deepEqual(pointAt(view, 0.5, 0.5, 2), { x: -0.5, y: 0 });
  assert.deepEqual(pointAt(view, 0, 0, 2), { x: -2.5, y: 1 });
  assert.deepEqual(pointAt(view, 1, 1, 2), { x: 1.5, y: -1 });
});

test('zoom preserves the coordinate under the pointer', () => {
  const view = { x: -0.5, y: 0.2, span: 3 };
  const before = pointAt(view, 0.2, 0.7, 1.8);
  const after = pointAt(zoomAt(view, 0.4, 0.2, 0.7, 1.8), 0.2, 0.7, 1.8);
  assert.ok(Math.abs(before.x - after.x) < 1e-14);
  assert.ok(Math.abs(before.y - after.y) < 1e-14);
});

test('zoom clamps at the floating-point precision and overview limits', () => {
  assert.equal(zoomAt({ x: 0, y: 0, span: MIN_SPAN }, 0.1).span, MIN_SPAN);
  assert.equal(zoomAt({ x: 0, y: 0, span: INITIAL_SPAN }, 100).span, INITIAL_SPAN * 2);
});

test('all palettes produce opaque pixels and distinguish interior from exterior', () => {
  for (const palette of Object.values(palettes)) {
    const inside = new Uint8ClampedArray(4);
    renderPixels(inside, 1, 1, { x: 0, y: 0, span: 0.01 }, 100, palette);
    assert.deepEqual([...inside], [5, 9, 18, 255]);
    const outside = new Uint8ClampedArray(4);
    renderPixels(outside, 1, 1, { x: 2, y: 1, span: 0.01 }, 100, palette);
    assert.equal(outside[3], 255);
    assert.notDeepEqual(outside, inside);
  }
});

test('default destination retains visible structure at deep zoom', () => {
  const pixels = new Uint8ClampedArray(32 * 32 * 4);
  renderPixels(pixels, 32, 32, { ...destinations.seahorse, span: 1e-8 }, 1400, palettes.aurora);
  const colors = new Set();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
  }
  assert.ok(colors.size > 20, 'deep zoom should not collapse to a single color');
});
