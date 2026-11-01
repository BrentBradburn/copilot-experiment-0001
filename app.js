import { INITIAL_SPAN, MIN_SPAN, ZOOM_RATE, correspondingC, destinations, palettes, zoomAt, panBy, panOffset, renderPixels, renderJuliaPixels, pointsOfInterest, startDemo, stepDemo } from './mandelbrot.js';

const $ = (id) => document.getElementById(id);
const canvas = $('fractal');
const context = canvas.getContext('2d', { alpha: false });
const buffer = document.createElement('canvas');
const bufferContext = buffer.getContext('2d', { alpha: false });
const juliaCanvas = $('julia');
const juliaContext = juliaCanvas.getContext('2d', { alpha: false });
const juliaBuffer = document.createElement('canvas');
const juliaBufferContext = juliaBuffer.getContext('2d', { alpha: false });
const MAX_WORK = 60000000;
let view = { ...destinations.seahorse };
let playing = false;
let demo = null;
let pending = false;
let lastTime = 0;
let status = 'Ready to explore';
let dragging = false;
let drag = null;
let suppressClick = false;
let rendered = null;
let panRenderTimer = 0;
let fullQualityPanRender = false;
let lastJuliaDraw = 0;
let juliaKey = '';
const PAN_THRESHOLD = 3;

function formatSigned(value) {
  const text = Math.abs(value).toFixed(6);
  return value < 0 ? `−${text}` : text;
}

function formatC(c) {
  const sign = c.y < 0 ? '−' : '+';
  return `c = ${formatSigned(c.x)} ${sign} ${Math.abs(c.y).toFixed(6)}i`;
}

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
  const maxPixels = Math.max(20000, Math.min(fullQualityPanRender ? 650000 : (playing || dragging ? 130000 : 650000), Math.floor(MAX_WORK / limit)));
  const width = Math.max(1, Math.floor(Math.min(bounds.width * Math.min(devicePixelRatio || 1, 2), Math.sqrt(maxPixels * aspect))));
  const height = Math.max(1, Math.floor(width / aspect));
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
  rendered = { x: view.x, y: view.y, span: view.span, width: canvas.width, height: canvas.height };
  fullQualityPanRender = false;
  updateTelemetry();
  drawJulia();
}

function drawJulia(throttled = false) {
  const now = performance.now();
  if (throttled && now - lastJuliaDraw < 100) return;
  const bounds = juliaCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const c = correspondingC(view);
  const limit = Math.min(Number($('iterations').value), playing || dragging ? 100 : 220);
  const quality = playing || dragging ? 'low' : 'high';
  const key = `${c.x},${c.y},${limit},${quality},${$('palette').value},${bounds.width},${bounds.height}`;
  if (key === juliaKey) return;
  juliaKey = key;
  lastJuliaDraw = now;
  const aspect = bounds.width / bounds.height;
  const maxPixels = playing || dragging ? 20000 : 70000;
  const width = Math.max(1, Math.floor(Math.min(bounds.width * Math.min(devicePixelRatio || 1, 2), Math.sqrt(maxPixels * aspect))));
  const height = Math.max(1, Math.floor(width / aspect));
  juliaBuffer.width = width;
  juliaBuffer.height = height;
  const image = juliaBufferContext.createImageData(width, height);
  renderJuliaPixels(image.data, width, height, c, limit, palettes[$('palette').value]);
  juliaBufferContext.putImageData(image, 0, 0);
  const displayWidth = Math.round(bounds.width * Math.min(devicePixelRatio || 1, 2));
  const displayHeight = Math.round(bounds.height * Math.min(devicePixelRatio || 1, 2));
  if (juliaCanvas.width !== displayWidth || juliaCanvas.height !== displayHeight) {
    juliaCanvas.width = displayWidth;
    juliaCanvas.height = displayHeight;
  }
  juliaContext.drawImage(juliaBuffer, 0, 0, juliaCanvas.width, juliaCanvas.height);
  const label = formatC(c);
  $('julia-c').textContent = label;
  juliaCanvas.setAttribute('aria-label', `Julia set for the Mandelbrot view center, ${label}`);
}

function demoStatus(state) {
  if (state.phase === 'out') return 'Demo · zooming out';
  if (state.phase === 'in') return 'Demo · zooming in';
  return 'Demo · holding';
}

function updateControls() {
  const playLabel = playing
    ? (demo ? 'Ⅱ Pause demo' : 'Ⅱ Pause zooming')
    : (demo ? '▶ Resume demo' : '▶ Start zooming');
  $('play').textContent = playLabel;
  $('play').setAttribute('aria-pressed', String(playing));
  $('demo').textContent = demo ? 'Stop demo' : 'Start demo';
  $('demo').setAttribute('aria-pressed', String(Boolean(demo)));
  $('live-badge').replaceChildren(document.createElement('i'), document.createTextNode(demo ? ' DEMO' : ' LIVE RENDER'));
}

function showPointOfInterest(key) {
  const poi = pointsOfInterest[key];
  $('location-label').textContent = poi.label;
  if ([...$('destination').options].some((option) => option.value === key)) $('destination').value = key;
}

function frame(time) {
  pending = false;
  if (playing && demo) {
    const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.15) : 0;
    const result = stepDemo(demo, elapsed, Number($('speed').value));
    demo = result.state;
    view = { ...demo.view };
    if (result.relocated) showPointOfInterest(demo.key);
    lastTime = time;
    status = demoStatus(demo);
  } else if (playing) {
    const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.15) : 0;
    view = zoomAt(view, Math.exp(-elapsed * Number($('speed').value) * ZOOM_RATE));
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
  status = message || (playing ? (demo ? demoStatus(demo) : 'Exploring') : (demo ? 'Demo paused' : 'Paused'));
  updateControls();
  requestDraw();
}

function beginDemo() {
  demo = startDemo(Math.random);
  view = { ...demo.view };
  showPointOfInterest(demo.key);
  setPlaying(true, demoStatus(demo));
}

function endDemo(message = 'Paused') {
  if (!demo) return;
  demo = null;
  setPlaying(false, message);
}

function resetView() {
  demo = null;
  view = { ...destinations[$('destination').value] };
  $('location-label').textContent = $('destination').selectedOptions[0].textContent;
  setPlaying(false, 'Ready to explore');
}

function releaseDemo() {
  if (!demo) return false;
  demo = null;
  return true;
}

function manualZoom(factor, u = 0.5, v = 0.5) {
  const tookOver = releaseDemo();
  view = zoomAt(view, factor, u, v, canvas.clientWidth / canvas.clientHeight);
  if (tookOver) {
    setPlaying(false, 'Paused');
    return;
  }
  status = view.span <= MIN_SPAN ? 'Precision limit reached' : playing ? 'Exploring' : 'Paused';
  updateControls();
  requestDraw();
}

function pointerFractions(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    u: (event.clientX - bounds.left) / bounds.width,
    v: (event.clientY - bounds.top) / bounds.height,
    bounds,
  };
}

function cancelPanRender() {
  if (!panRenderTimer) return;
  clearTimeout(panRenderTimer);
  panRenderTimer = 0;
}

function schedulePanRender() {
  cancelPanRender();
  panRenderTimer = setTimeout(() => {
    panRenderTimer = 0;
    if (dragging) {
      fullQualityPanRender = true;
      requestDraw();
    }
  }, 120);
}

function showPanPreview() {
  const sameFrame = rendered
    && rendered.width === canvas.width
    && rendered.height === canvas.height
    && rendered.span === view.span;
  if (!sameFrame) {
    updateTelemetry();
    requestDraw();
    return;
  }
  const offset = panOffset(rendered, view, canvas.width, canvas.height);
  context.fillStyle = '#050912';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(buffer, offset.x, offset.y, canvas.width, canvas.height);
  updateTelemetry();
  drawJulia(true);
  if (playing) requestDraw();
  else schedulePanRender();
}

function beginPan() {
  dragging = true;
  canvas.classList.add('panning');
  $('location-label').textContent = 'Custom coordinates';
  if (releaseDemo()) {
    playing = false;
    lastTime = 0;
    updateControls();
  }
  status = 'Panning';
  updateTelemetry();
}

function finishPan() {
  dragging = false;
  canvas.classList.remove('panning');
  cancelPanRender();
  status = view.span <= MIN_SPAN ? 'Precision limit reached' : playing ? 'Exploring' : 'Paused';
  updateControls();
  updateTelemetry();
  requestDraw();
}

$('play').addEventListener('click', () => setPlaying(!playing));
$('demo').addEventListener('click', () => {
  if (demo) endDemo();
  else beginDemo();
});
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
  const { u, v } = pointerFractions(event);
  manualZoom(Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * 0.002))), u, v);
}, { passive: false });
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // The pointer can already be inactive; dragging still tracks while it stays over the canvas.
  }
  drag = { pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (event.buttons === 0) {
    endDrag(event);
    return;
  }
  const dx = event.clientX - drag.lastX;
  const dy = event.clientY - drag.lastY;
  if (!drag.moved && Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) < PAN_THRESHOLD) return;
  if (!drag.moved) beginPan();
  drag.moved = true;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  const { bounds } = pointerFractions(event);
  if (!bounds.width || !bounds.height) return;
  view = panBy(view, dx / bounds.width, dy / bounds.height, bounds.width / bounds.height);
  showPanPreview();
});
function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const moved = drag.moved;
  drag = null;
  if (!moved) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  finishPan();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);
canvas.addEventListener('click', (event) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const { u, v, bounds } = pointerFractions(event);
  if (!bounds.width || !bounds.height || u < 0 || u > 1 || v < 0 || v > 1) return;
  $('location-label').textContent = 'Custom coordinates';
  manualZoom(0.7, u, v);
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
const demoQuery = new URLSearchParams(location.search).get('demo');
if (demoQuery !== null && demoQuery !== '0' && demoQuery !== 'false') beginDemo();
else requestDraw();
