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
