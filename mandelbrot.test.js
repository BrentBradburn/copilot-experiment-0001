import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeTime, pointAt, zoomAt, renderPixels, palettes, destinations, pointsOfInterest, pickPointOfInterest, createDemoState, startDemo, stepDemo, INITIAL_SPAN, MIN_SPAN, DEMO_DWELL_SECONDS } from './mandelbrot.js';

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

test('demo selects a known point of interest and avoids an immediate repeat', () => {
  const keys = Object.keys(pointsOfInterest);
  assert.ok(keys.length > 1);
  assert.equal(pickPointOfInterest(() => 0), keys[0]);
  assert.equal(pickPointOfInterest(() => 0.999999), keys[keys.length - 1]);
  assert.equal(pickPointOfInterest(() => 0, keys[0]), keys[1]);
  assert.equal(pickPointOfInterest(() => 1), keys[0]);
  for (const poi of Object.values(pointsOfInterest)) {
    assert.equal(typeof poi.label, 'string');
    assert.ok(poi.label.length > 0);
    assert.ok(poi.span > MIN_SPAN);
  }
});

test('demo zooms in at a point of interest, holds, then zooms back out', () => {
  const origin = createDemoState('seahorse');
  assert.equal(origin.phase, 'in');
  assert.deepEqual(origin.view, { x: destinations.seahorse.x, y: destinations.seahorse.y, span: destinations.seahorse.span });
  assert.ok(origin.deepSpan < origin.home.span);
  assert.ok(origin.deepSpan >= MIN_SPAN);

  let state = origin;
  let sawDeepHold = false;
  let sawZoomOut = false;
  for (let step = 0; step < 2000 && state.key === 'seahorse'; step++) {
    const before = state.view.span;
    const result = stepDemo(state, 0.05, 2, () => 0);
    state = result.state;
    assert.equal(state.view.x, state.home.x);
    assert.equal(state.view.y, state.home.y);
    assert.ok(state.view.span >= MIN_SPAN);
    if (state.key !== 'seahorse') {
      assert.equal(result.relocated, true);
      break;
    }
    if (state.phase === 'in') assert.ok(state.view.span <= before);
    if (state.phase === 'dwell-in') {
      sawDeepHold = true;
      assert.equal(state.view.span, origin.deepSpan);
    }
    if (state.phase === 'out') {
      sawZoomOut = true;
      assert.ok(state.view.span >= before);
    }
    if (state.phase === 'dwell-out') assert.equal(state.view.span, origin.home.span);
  }

  assert.equal(sawDeepHold, true);
  assert.equal(sawZoomOut, true);
  assert.equal(state.key, 'elephant');
  assert.equal(state.phase, 'in');
  assert.equal(state.view.span, destinations.elephant.span);
  assert.equal(origin.view.span, destinations.seahorse.span);
});

test('demo dwell lasts the configured hold before reversing', () => {
  let state = createDemoState('spiral');
  while (state.phase !== 'dwell-in') state = stepDemo(state, 0.05, 3).state;
  const held = stepDemo(state, DEMO_DWELL_SECONDS - 0.05, 3).state;
  assert.equal(held.phase, 'dwell-in');
  assert.equal(held.view.span, state.deepSpan);
  const reversed = stepDemo(held, 0.05, 3).state;
  assert.equal(reversed.phase, 'out');
  assert.equal(reversed.view.x, destinations.spiral.x);
  assert.equal(reversed.view.y, destinations.spiral.y);
});

test('demo ignores empty time steps and starts on a known point', () => {
  const state = startDemo(() => 0.5);
  assert.ok(pointsOfInterest[state.key]);
  const paused = stepDemo(state, 0, 1).state;
  assert.equal(paused, state);
  assert.equal(stepDemo(state, 1, 0).state, state);
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
