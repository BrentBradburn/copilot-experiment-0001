import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('start zooming is split into side-by-side zoom in and zoom out buttons', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.equal(html.includes('>▶ Start zooming<'), false);
  assert.equal(html.includes('id="play"'), false);
  const group = html.match(/<div class="play-buttons"[\s\S]*?<\/div>/);
  assert.ok(group, 'animated zoom buttons should sit in one group');
  assert.match(group[0], /id="play-in"[\s\S]*Zoom in/);
  assert.match(group[0], /id="play-out"[\s\S]*Zoom out/);
  assert.equal(group[0].indexOf('id="play-in"') < group[0].indexOf('id="play-out"'), true);
  assert.match(css, /\.play-buttons\s*\{[^}]*display:\s*flex/);
  assert.match(app, /\$\('play-in'\)\.addEventListener\('click', \(\) => startZoom\('in'\)\)/);
  assert.match(app, /\$\('play-out'\)\.addEventListener\('click', \(\) => startZoom\('out'\)\)/);
  assert.equal(app.includes("$('play')"), false);
});

test('polished render is an in-place control with quality and artwork save', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const quality = html.match(/<select id="polish-samples"[\s\S]*?<\/select>/);
  assert.ok(quality, 'frame quality control should be present');
  assert.match(quality[0], /value="2" selected/);
  assert.match(quality[0], /2×2 samples/);
  assert.match(quality[0], /4×4 samples/);
  assert.match(html, /id="polish"[\s\S]*Polish frame/);
  assert.match(html, /id="save-frame"[\s\S]*Save artwork/);
  assert.match(html, /id="polish-progress"[\s\S]*aria-hidden="true"/);
  assert.match(css, /\.polish-button\s*\{/);
  assert.match(app, /\$\('polish'\)\.addEventListener\('click'/);
  assert.match(app, /function startPolish\(/);
  assert.match(app, /renderPixelRows\(/);
  assert.match(app, /normalizeSamples\(\$\('polish-samples'\)\.value\)/);
  assert.match(app, /link\.download = 'infinite-mandelbrot\.png'/);
  assert.equal(app.includes('zoomAt(view, 1)'), false);
});

test('status panel stays directly under the render panel', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const stage = html.match(/<div class="stage">([\s\S]*?)<\/div>\s*<aside class="controls"/);
  assert.ok(stage, 'render and status should share a column beside the controls');
  assert.match(stage[1], /class="viewer"/);
  assert.match(stage[1], /class="telemetry"/);
  assert.equal(stage[1].indexOf('class="viewer"') < stage[1].indexOf('class="telemetry"'), true);
  assert.equal(/<\/div>\s*<section class="telemetry"/.test(html), false);
  assert.match(css, /\.stage\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
  assert.match(css, /\.workspace\s*\{[^}]*align-items:\s*start/);
});
