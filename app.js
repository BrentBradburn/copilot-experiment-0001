import { INITIAL_SPAN, MIN_SPAN, destinations, palettes, pointAt, zoomAt, renderPixels } from './mandelbrot.js';

const $ = (id) => document.getElementById(id);
const canvas = $('fractal');
const context = canvas.getContext('2d', { alpha: false });
const buffer = document.createElement('canvas');
const bufferContext = buffer.getContext('2d', { alpha: false });
const MAX_WORK = 60000000;
let view = { ...destinations.seahorse };
let playing = false;
let pending = false;
let lastTime = 0;
let status = 'Ready to explore';

function updateTelemetry() {
  const zoom = INITIAL_SPAN / view.span;
  $('magnification').textContent = `${zoom >= 100000 ? zoom.toExponential(2) : zoom.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}×`;
  $('real-axis').textContent = view.x.toFixed(10);
  $('imaginary-axis').textContent = view.y.toFixed(10);
  $('status').replaceChildren(document.createElement('i'), document.createTextNode(status));
}

function draw() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const aspect = bounds.width / bounds.height;
  const limit = Number($('iterations').value) + Math.max(0, Math.floor(Math.log2(INITIAL_SPAN / view.span)) - 8) * 40;
  const maxPixels = Math.max(20000, Math.min(playing ? 130000 : 650000, Math.floor(MAX_WORK / limit)));
  const width = Math.max(1, Math.round(Math.min(bounds.width * Math.min(devicePixelRatio || 1, 2), Math.sqrt(maxPixels * aspect))));
  const height = Math.max(1, Math.round(width / aspect));
  buffer.width = width;
  buffer.height = height;
  const image = bufferContext.createImageData(width, height);
  renderPixels(image.data, width, height, view, limit, palettes[$('palette').value]);
  bufferContext.putImageData(image, 0, 0);
  const displayWidth = Math.round(bounds.width * Math.min(devicePixelRatio || 1, 2));
  const displayHeight = Math.round(bounds.height * Math.min(devicePixelRatio || 1, 2));
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
  context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  updateTelemetry();
}

function frame(time) {
  pending = false;
  if (playing) {
    const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.15) : 0;
    view = zoomAt(view, Math.exp(-elapsed * Number($('speed').value) * 0.55));
    lastTime = time;
    if (view.span <= MIN_SPAN) setPlaying(false, 'Precision limit reached');
  }
  draw();
  if (playing) requestDraw();
}

function requestDraw() {
  if (!pending) {
    pending = true;
    requestAnimationFrame(frame);
  }
}

function setPlaying(value, message) {
  playing = value;
  lastTime = 0;
  status = message || (playing ? 'Exploring' : 'Paused');
  $('play').textContent = playing ? 'Ⅱ Pause zooming' : '▶ Start zooming';
  $('play').setAttribute('aria-pressed', String(playing));
  requestDraw();
}

function resetView() {
  view = { ...destinations[$('destination').value] };
  $('location-label').textContent = $('destination').selectedOptions[0].textContent;
  setPlaying(false, 'Ready to explore');
}

function manualZoom(factor, u = 0.5, v = 0.5) {
  view = zoomAt(view, factor, u, v, canvas.clientWidth / canvas.clientHeight);
  status = view.span <= MIN_SPAN ? 'Precision limit reached' : playing ? 'Exploring' : 'Paused';
  requestDraw();
}

$('play').addEventListener('click', () => setPlaying(!playing));
$('reset').addEventListener('click', resetView);
$('destination').addEventListener('change', resetView);
$('zoom-in').addEventListener('click', () => manualZoom(0.5));
$('zoom-out').addEventListener('click', () => manualZoom(2));
$('speed').addEventListener('input', () => {
  $('speed-value').textContent = `${Number($('speed').value).toFixed(1)}×`;
});
$('iterations').addEventListener('input', () => {
  $('iterations-value').textContent = $('iterations').value;
  requestDraw();
});
$('palette').addEventListener('change', () => {
  $('palette-preview').dataset.palette = $('palette').value;
  requestDraw();
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  manualZoom(Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * 0.002))), (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
}, { passive: false });
canvas.addEventListener('click', (event) => {
  const bounds = canvas.getBoundingClientRect();
  const point = pointAt(view, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height, bounds.width / bounds.height);
  view = { ...view, ...point };
  $('location-label').textContent = 'Custom coordinates';
  manualZoom(0.7);
});
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat || event.target.closest('button, input, select, a')) return;
  event.preventDefault();
  setPlaying(!playing);
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await canvas.parentElement.requestFullscreen();
  } catch {
    status = 'Fullscreen unavailable';
    updateTelemetry();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) setPlaying(false);
});
new ResizeObserver(requestDraw).observe(canvas);
requestDraw();
