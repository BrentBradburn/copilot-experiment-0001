import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeTime, juliaEscapeTime, pointAt, zoomAt, continuousZoomFactor, panBy, panOffset, renderPixels, renderPixelRows, renderJuliaPixels, renderJuliaPixelRows, correspondingC, palettes, destinations, pointsOfInterest, pickPointOfInterest, createDemoState, startDemo, stepDemo, INITIAL_SPAN, MIN_SPAN, JULIA_SPAN, DEMO_DWELL_SECONDS, normalizeSamples, formatArtworkMark, parseArtworkMark, formatCoordinate, parseCoordinate, coordinatesFromEntry, detailIterations, normalizeDetailIterations, DETAIL_MIN_EXPONENT, DETAIL_MAX_EXPONENT, DETAIL_DEFAULT_EXPONENT } from './mandelbrot.js';

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

test('pointer zoom holds the clicked coordinate instead of recentering on it', () => {
  const view = { x: -0.5, y: 0.2, span: 2 };
  const aspect = 1.5;
  const u = 0.25;
  const v = 0.8;
  const clicked = pointAt(view, u, v, aspect);
  const zoomed = zoomAt(view, 0.7, u, v, aspect);
  const underPointer = pointAt(zoomed, u, v, aspect);
  assert.ok(Math.abs(underPointer.x - clicked.x) < 1e-12);
  assert.ok(Math.abs(underPointer.y - clicked.y) < 1e-12);
  assert.ok(Math.abs(zoomed.x - clicked.x) > 1e-6);
  assert.ok(Math.abs(zoomed.y - clicked.y) > 1e-6);
  assert.ok(zoomed.span < view.span);
});

test('dragging pans the view and the preview follows the pointer', () => {
  const view = { x: -0.25, y: 0.4, span: 1.6 };
  const aspect = 1.25;
  const u = 0.3;
  const v = 0.6;
  const grabbed = pointAt(view, u, v, aspect);
  const du = 0.15;
  const dv = -0.2;
  const panned = panBy(view, du, dv, aspect);
  assert.equal(panned.span, view.span);
  const moved = pointAt(panned, u + du, v + dv, aspect);
  assert.ok(Math.abs(moved.x - grabbed.x) < 1e-12);
  assert.ok(Math.abs(moved.y - grabbed.y) < 1e-12);
  const offset = panOffset(view, panned, 800, 640);
  assert.ok(Math.abs(offset.x - du * 800) < 1e-9);
  assert.ok(Math.abs(offset.y - dv * 640) < 1e-9);
  const back = panBy(panned, -du, -dv, aspect);
  assert.ok(Math.abs(back.x - view.x) < 1e-12);
  assert.ok(Math.abs(back.y - view.y) < 1e-12);
});

test('zoom clamps at the floating-point precision and overview limits', () => {
  assert.equal(zoomAt({ x: 0, y: 0, span: MIN_SPAN }, 0.1).span, MIN_SPAN);
  assert.equal(zoomAt({ x: 0, y: 0, span: INITIAL_SPAN }, 100).span, INITIAL_SPAN * 2);
});

test('continuous zoom in shrinks the span and zoom out expands it around the center', () => {
  const view = { x: -0.5, y: 0.25, span: 1 };
  const inward = zoomAt(view, continuousZoomFactor(0.2, 1, 'in'));
  const outward = zoomAt(view, continuousZoomFactor(0.2, 1, 'out'));
  assert.ok(inward.span < view.span);
  assert.ok(outward.span > view.span);
  assert.equal(inward.x, view.x);
  assert.equal(inward.y, view.y);
  assert.equal(outward.x, view.x);
  assert.equal(outward.y, view.y);
  assert.ok(Math.abs(inward.span * outward.span - view.span ** 2) < 1e-12);
  assert.equal(continuousZoomFactor(0.2, 1), continuousZoomFactor(0.2, 1, 'in'));
  assert.equal(zoomAt({ x: 0, y: 0, span: INITIAL_SPAN * 2 }, continuousZoomFactor(1, 3, 'out')).span, INITIAL_SPAN * 2);
  assert.equal(zoomAt({ x: 1, y: 1, span: MIN_SPAN }, continuousZoomFactor(1, 3, 'in')).span, MIN_SPAN);
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

test('Julia escape follows z² + c and does not use the Mandelbrot interior shortcut', () => {
  assert.equal(juliaEscapeTime(0, 0, 0, 0, 40), -1);
  assert.equal(juliaEscapeTime(0.5, 0, 0, 0, 40), -1);
  assert.ok(juliaEscapeTime(1.5, 0, 0, 0, 40) > 0);
  assert.equal(juliaEscapeTime(0, 0, -0.75, 0, 80), -1);
  assert.ok(juliaEscapeTime(0, 0, 0.5, 0, 40) > 0);
  assert.ok(juliaEscapeTime(-0.1, 0.1, 0, 0, 40) < 0);
});

test('corresponding Julia uses the Mandelbrot view center', () => {
  const view = { ...destinations.seahorse, span: 1e-6 };
  assert.deepEqual(correspondingC(view), { x: destinations.seahorse.x, y: destinations.seahorse.y });
  assert.equal(JULIA_SPAN, 4);
  const seahorse = new Uint8ClampedArray(24 * 24 * 4);
  const other = new Uint8ClampedArray(24 * 24 * 4);
  renderJuliaPixels(seahorse, 24, 24, correspondingC(view), 180, palettes.aurora);
  renderJuliaPixels(other, 24, 24, { x: 0.28, y: -0.52 }, 180, palettes.aurora);
  assert.notDeepEqual(seahorse, other);
  const colors = new Set();
  for (let offset = 0; offset < seahorse.length; offset += 4) {
    assert.equal(seahorse[offset + 3], 255);
    colors.add(`${seahorse[offset]},${seahorse[offset + 1]},${seahorse[offset + 2]}`);
  }
  assert.ok(colors.size > 8, 'the Julia set for the default center should show structure');
});

test('Julia rendering shows the filled set for c = 0 inside a fixed window', () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  renderJuliaPixels(pixels, 5, 5, { x: 0, y: 0 }, 30, palettes.ocean);
  assert.deepEqual([...pixels.slice(12 * 4, 13 * 4)], [5, 9, 18, 255]);
  assert.notDeepEqual([...pixels.slice(0, 4)], [5, 9, 18, 255]);
  const outside = new Uint8ClampedArray(4);
  renderJuliaPixels(outside, 1, 1, { x: 1, y: 1 }, 40, palettes.ember, 0.2);
  assert.equal(outside[3], 255);
  assert.notDeepEqual([...outside], [5, 9, 18, 255]);
});

test('polished sampling keeps the selected view and supersamples aliasing in place', () => {
  assert.equal(normalizeSamples(0), 1);
  assert.equal(normalizeSamples(2.8), 2);
  assert.equal(normalizeSamples(99), 8);
  const view = { x: 0.25, y: 0, span: 0.5 };
  const snapshot = { ...view };
  const single = new Uint8ClampedArray(4);
  const polished = new Uint8ClampedArray(4);
  renderPixels(single, 1, 1, view, 80, palettes.aurora, 1);
  renderPixels(polished, 1, 1, view, 80, palettes.aurora, 2);
  assert.deepEqual(view, snapshot);
  assert.deepEqual([...single], [5, 9, 18, 255]);
  assert.equal(polished[3], 255);
  assert.notDeepEqual([...polished], [...single]);
  const again = new Uint8ClampedArray(4);
  renderPixels(again, 1, 1, view, 80, palettes.aurora, 2);
  assert.deepEqual(again, polished);

  const interior = new Uint8ClampedArray(4);
  renderPixels(interior, 1, 1, { x: 0, y: 0, span: 0.01 }, 40, palettes.ocean, 4);
  assert.deepEqual([...interior], [5, 9, 18, 255]);

  const rows = new Uint8ClampedArray(4 * 4 * 4);
  rows.fill(7);
  renderPixelRows(rows, 4, 4, { x: 2, y: 1, span: 0.2 }, 30, palettes.ember, 1, 3, 2);
  assert.equal(rows[0], 7);
  assert.equal(rows[3 * 4 * 4], 7);
  assert.equal(rows[1 * 4 * 4 + 3], 255);
  assert.notEqual(rows[1 * 4 * 4], 7);

  const juliaSingle = new Uint8ClampedArray(4);
  const juliaPolished = new Uint8ClampedArray(4);
  renderJuliaPixels(juliaSingle, 1, 1, { x: 0, y: 0 }, 40, palettes.aurora, JULIA_SPAN, 1);
  renderJuliaPixels(juliaPolished, 1, 1, { x: 0, y: 0 }, 40, palettes.aurora, JULIA_SPAN, 2);
  assert.deepEqual([...juliaSingle], [5, 9, 18, 255]);
  assert.notDeepEqual([...juliaPolished], [...juliaSingle]);
  const juliaRows = new Uint8ClampedArray(8);
  juliaRows.fill(3);
  renderJuliaPixelRows(juliaRows, 1, 2, { x: 0, y: 0 }, 20, palettes.ocean, 1, 2, 1, 1);
  assert.equal(juliaRows[0], 3);
  assert.equal(juliaRows[7], 255);
});

test('artwork mark is a single complex coordinate and does not move the view', () => {
  const views = [
    ...Object.values(destinations),
    { x: -0.761574, y: -0.0847596, span: 0.012 },
    { x: 0, y: -0, span: MIN_SPAN },
    { x: -1.25, y: 0.0000001, span: INITIAL_SPAN / 1e9 },
  ];
  for (const view of views) {
    const snapshot = { ...view };
    const mark = formatArtworkMark(view);
    assert.deepEqual(view, snapshot);
    assert.equal(mark.text.includes('\n'), false);
    assert.equal(mark.text.includes('×'), false);
    assert.equal(mark.text.includes('span'), false);
    assert.match(mark.text, / [+-] .+i$/);
    const parsed = parseArtworkMark(mark.text);
    assert.equal(parsed.x, view.x);
    assert.equal(Object.is(parsed.y, view.y) || parsed.y === view.y, true);
    assert.equal('span' in parsed, false);
  }
  assert.equal(parseArtworkMark('not a mark'), null);
  assert.equal(parseArtworkMark('1 + 2i\n3×'), null);
  assert.equal(parseArtworkMark('1 + 2'), null);
});

test('keyboard coordinates accept exponential notation at full precision', () => {
  const real = -1.234567890123456e-11;
  const imag = 9.876543210987654e-9;
  assert.notEqual(real, Number(real.toFixed(10)));
  assert.match(formatCoordinate(real), /e/i);
  assert.equal(parseCoordinate(formatCoordinate(real)), real);
  assert.equal(parseCoordinate(imag.toExponential()), imag);
  assert.equal(parseCoordinate('  +6.25E-2 '), 0.0625);
  assert.equal(parseCoordinate('−0.5'), -0.5);
  assert.equal(Object.is(parseCoordinate('-0'), -0), true);
  assert.equal(parseCoordinate(''), null);
  assert.equal(parseCoordinate('1.2e-3i'), null);
  assert.equal(parseCoordinate('1.2e'), null);
  assert.equal(parseCoordinate('Infinity'), null);
  assert.equal(parseCoordinate('1e309'), null);
  assert.equal(parseCoordinate(real.toFixed(10)), Number(real.toFixed(10)));
  const entered = coordinatesFromEntry(formatCoordinate(real), formatCoordinate(imag));
  assert.equal(entered.x, real);
  assert.equal(entered.y, imag);
  assert.equal('span' in entered, false);
  const mark = formatArtworkMark({ x: real, y: imag, span: MIN_SPAN });
  assert.match(mark.text, /e/i);
  const fromMark = coordinatesFromEntry(mark.text, '99');
  assert.equal(fromMark.x, real);
  assert.equal(fromMark.y, imag);
  assert.equal(coordinatesFromEntry('−1.25e-8 + 3e-9i', '').y, 3e-9);
  assert.equal(coordinatesFromEntry('nope', '1'), null);
  assert.equal(coordinatesFromEntry('1.5', ''), null);
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

test('detail level is 17 power-of-two stops from 2^0 through 2^16', () => {
  assert.equal(DETAIL_MIN_EXPONENT, 0);
  assert.equal(DETAIL_MAX_EXPONENT, 16);
  assert.equal(DETAIL_MAX_EXPONENT - DETAIL_MIN_EXPONENT + 1, 17);
  assert.equal(DETAIL_DEFAULT_EXPONENT, 8);
  const values = [];
  for (let exponent = DETAIL_MIN_EXPONENT; exponent <= DETAIL_MAX_EXPONENT; exponent++) {
    values.push(detailIterations(exponent));
    assert.equal(detailIterations(exponent), 2 ** exponent);
  }
  assert.deepEqual(values, [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]);
  assert.equal(detailIterations(DETAIL_DEFAULT_EXPONENT), 256);
  assert.equal(detailIterations(-4), 1);
  assert.equal(detailIterations(20), 65536);
  assert.equal(detailIterations(7.4), 128);
  assert.equal(detailIterations('nope'), 256);
  assert.equal(normalizeDetailIterations(256), 256);
  assert.equal(normalizeDetailIterations(65536), 65536);
  assert.equal(normalizeDetailIterations(1), 1);
  assert.equal(normalizeDetailIterations(240), 256);
  assert.equal(normalizeDetailIterations(100000), 65536);
  assert.equal(normalizeDetailIterations(0), 256);
  assert.equal(normalizeDetailIterations('nope'), 256);
  for (let exponent = DETAIL_MIN_EXPONENT; exponent <= DETAIL_MAX_EXPONENT; exponent++) {
    assert.equal(normalizeDetailIterations(2 ** exponent), 2 ** exponent);
  }
});
