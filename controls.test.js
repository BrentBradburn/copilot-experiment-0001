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

test('polished artwork signs the lower-left with a complex coordinate by default', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const panel = html.match(/<div id="polish-panel" class="polish-panel">[\s\S]*?<\/div>\s*<p id="keyboard-hint"/);
  assert.ok(panel, 'watermark option should live with the polish controls');
  assert.match(panel[0], /id="watermark" type="checkbox" checked/);
  assert.match(panel[0], /Location watermark/);
  assert.match(panel[0], /id="watermark-preview" class="watermark-preview" hidden/);
  assert.match(css, /\.check-row\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.watermark-preview\s*\{[^}]*font-style:\s*italic/);
  assert.match(css, /\.viewer\.signed #location-label/);
  assert.match(app, /formatArtworkMark\(polishedFrame \|\| view\)/);
  assert.match(app, /function paintArtworkMark\(/);
  assert.match(app, /ctx\.textAlign = 'left'/);
  assert.match(app, /ctx\.textBaseline = 'bottom'/);
  assert.match(app, /italic \$\{fontSize\}px Georgia/);
  assert.match(app, /function syncArtworkMark\(/);
  assert.match(app, /classList\.toggle\('signed', signed\)/);
  assert.match(app, /if \(\$\('watermark'\)\.checked\) paintArtworkMark\(context/);
  assert.match(app, /\$\('watermark'\)\.addEventListener\('change', syncArtworkMark\)/);
  const save = app.match(/function saveArtwork\(\) \{[\s\S]*?\n\}/);
  assert.ok(save, 'save should stay a single function');
  assert.equal(save[0].includes('view ='), false);
  assert.match(save[0], /artworkCanvas\(\)\.toBlob/);
  const exportCopy = app.match(/function artworkCanvas\(\) \{[\s\S]*?\n\}/);
  assert.ok(exportCopy, 'watermarked export should be a copy');
  assert.match(exportCopy[0], /if \(!\$\('watermark'\)\.checked\) return canvas/);
  assert.match(exportCopy[0], /paintArtworkMark\(ctx, copy\.width, copy\.height, polishedFrame \|\| view\)/);
  assert.equal(exportCopy[0].includes('view ='), false);
});

test('fullscreen viewer keeps polish and save on the image', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const controls = html.match(/<aside class="controls"[\s\S]*?<\/aside>/);
  assert.ok(controls, 'normal viewing panel should still own the polish controls');
  const panel = controls[0].match(/<div id="polish-panel" class="polish-panel">[\s\S]*?<\/div>\s*<p id="keyboard-hint"/);
  assert.ok(panel, 'polish controls should be one movable panel');
  assert.match(panel[0], /id="polish-samples"/);
  assert.match(panel[0], /id="polish"[\s\S]*Polish frame/);
  assert.match(panel[0], /id="polish-progress"[\s\S]*aria-hidden="true"/);
  assert.match(panel[0], /id="save-frame"[\s\S]*Save artwork/);
  assert.match(app, /function syncFullscreenPolish\(/);
  assert.match(app, /document\.fullscreenElement === viewer/);
  assert.match(app, /polishPanel\.classList\.add\('overlay'\)/);
  assert.match(app, /viewer\.appendChild\(polishPanel\)/);
  assert.match(app, /polishHome\.insertBefore\(polishPanel, polishNext\)/);
  assert.match(app, /document\.addEventListener\('fullscreenchange', syncFullscreenPolish\)/);
  assert.match(css, /\.polish-panel\.overlay\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.polish-progress\s*\{[^}]*visibility:\s*hidden/);
});

test('detail level slider has 15 power-of-two positions from 1 to 16384', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const slider = html.match(/<input id="iterations" type="range"[^>]*>/);
  assert.ok(slider, 'detail level should remain a range slider');
  assert.match(slider[0], /min="0"/);
  assert.match(slider[0], /max="14"/);
  assert.match(slider[0], /step="1"/);
  assert.match(slider[0], /value="8"/);
  assert.match(slider[0], /aria-valuetext="256 iterations"/);
  assert.match(html, /id="iterations-value"[^>]*>256</);
  assert.equal(html.includes('min="80"'), false);
  assert.equal(html.includes('max="800"'), false);
  assert.match(app, /function selectedIterations\(\) \{\s*return detailIterations\(\$\('iterations'\)\.value\);/);
  assert.match(app, /function iterationLimit\(\) \{\s*return selectedIterations\(\)/);
  assert.match(app, /\$\('iterations-value'\)\.textContent = String\(iterations\)/);
  assert.equal(app.includes("Number($('iterations').value)"), false);
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
