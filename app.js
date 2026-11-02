import { INITIAL_SPAN, MIN_SPAN, correspondingC, destinations, palettes, zoomAt, continuousZoomFactor, panBy, panOffset, renderPixelRows, renderJuliaPixelRows, pointsOfInterest, startDemo, stepDemo, normalizeSamples, JULIA_SPAN, formatArtworkMark, formatCoordinate, parseCoordinate, coordinatesFromEntry } from './mandelbrot.js';

const $ = (id) => document.getElementById(id);
const canvas = $('fractal');
const context = canvas.getContext('2d', { alpha: false });
const buffer = document.createElement('canvas');
const bufferContext = buffer.getContext('2d', { alpha: false });
const juliaCanvas = $('julia');
const juliaContext = juliaCanvas.getContext('2d', { alpha: false });
const juliaBuffer = document.createElement('canvas');
const juliaBufferContext = juliaBuffer.getContext('2d', { alpha: false });
const polishBuffer = document.createElement('canvas');
const polishContext = polishBuffer.getContext('2d', { alpha: false });
const juliaPolishBuffer = document.createElement('canvas');
const juliaPolishContext = juliaPolishBuffer.getContext('2d', { alpha: false });
const MAX_WORK = 60000000;
let view = { ...destinations.seahorse };
let playing = false;
let zoomDirection = 'in';
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
let polishing = false;
let polishToken = 0;
let polishedFrame = null;
const PAN_THRESHOLD = 3;
const POLISH_SLICE_MS = 14;

function formatSigned(value) {
  const text = Math.abs(value).toFixed(6);
  return value < 0 ? `−${text}` : text;
}

function formatC(c) {
  const sign = c.y < 0 ? '−' : '+';
  return `c = ${formatSigned(c.x)} ${sign} ${Math.abs(c.y).toFixed(6)}i`;
}

function displayScale() {
  return Math.min(devicePixelRatio || 1, 2);
}

function iterationLimit() {
  return Number($('iterations').value) + Math.max(0, Math.floor(Math.log2(INITIAL_SPAN / view.span)) - 8) * 40;
}

function polishSamples() {
  return normalizeSamples($('polish-samples').value);
}

function sameView(frame, next = view) {
  return frame.x === next.x && frame.y === next.y && frame.span === next.span;
}

function isPolishedCurrent() {
  if (!polishedFrame || polishing) return false;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.round(bounds.width * displayScale());
  const height = Math.round(bounds.height * displayScale());
  return sameView(polishedFrame)
    && polishedFrame.palette === $('palette').value
    && polishedFrame.iterations === Number($('iterations').value)
    && polishedFrame.width === canvas.width
    && polishedFrame.height === canvas.height
    && canvas.width === width
    && canvas.height === height;
}

let coordinateError = null;

function formatAxis(value) {
  const exact = formatCoordinate(value);
  const fixed = value.toFixed(10);
  if (value !== 0 && Number(fixed) === 0) return exact;
  return fixed;
}

function updateTelemetry() {
  const zoom = INITIAL_SPAN / view.span;
  $('magnification').textContent = `${zoom >= 100000 ? zoom.toExponential(2) : zoom.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}×`;
  $('real-axis').textContent = formatAxis(view.x);
  $('imaginary-axis').textContent = formatAxis(view.y);
  $('real-axis').title = formatCoordinate(view.x);
  $('imaginary-axis').title = formatCoordinate(view.y);
  $('status').replaceChildren(document.createElement('i'), document.createTextNode(status));
  syncCoordinateInputs();
  refreshWatermarkPreview();
}

function syncCoordinateInputs() {
  const errorStillCurrent = coordinateError
    && coordinateError.x === view.x
    && coordinateError.y === view.y
    && coordinateError.span === view.span;
  if (!errorStillCurrent) coordinateError = null;
  for (const [id, value] of [['coordinate-real', view.x], ['coordinate-imag', view.y]]) {
    const input = $(id);
    if (document.activeElement === input) continue;
    if (errorStillCurrent && input.getAttribute('aria-invalid') === 'true') continue;
    input.removeAttribute('aria-invalid');
    const text = formatCoordinate(value);
    if (input.value !== text) input.value = text;
  }
}

function applyCoordinates() {
  const realInput = $('coordinate-real');
  const imagInput = $('coordinate-imag');
  const entered = coordinatesFromEntry(realInput.value, imagInput.value);
  if (!entered) {
    coordinateError = { x: view.x, y: view.y, span: view.span };
    realInput.setAttribute('aria-invalid', String(parseCoordinate(realInput.value) === null));
    imagInput.setAttribute('aria-invalid', String(parseCoordinate(imagInput.value) === null));
    status = 'Enter real and imaginary coordinates';
    $('status').replaceChildren(document.createElement('i'), document.createTextNode(status));
    return;
  }
  coordinateError = null;
  realInput.removeAttribute('aria-invalid');
  imagInput.removeAttribute('aria-invalid');
  if (Object.is(entered.x, view.x) && Object.is(entered.y, view.y)) {
    syncCoordinateInputs();
    return;
  }
  cancelPolish();
  releaseDemo();
  playing = false;
  lastTime = 0;
  view = { x: entered.x, y: entered.y, span: view.span };
  realInput.value = formatCoordinate(entered.x);
  imagInput.value = formatCoordinate(entered.y);
  $('location-label').textContent = 'Custom coordinates';
  status = view.span <= MIN_SPAN ? 'Precision limit reached' : 'Paused';
  updateControls();
  requestDraw();
}

function refreshWatermarkPreview() {
  const preview = $('watermark-preview');
  const enabled = $('watermark').checked;
  preview.hidden = !enabled;
  preview.textContent = enabled ? formatArtworkMark(polishedFrame || view).text : '';
}

function draw() {
  if (polishing) return;
  if (isPolishedCurrent()) {
    updateTelemetry();
    drawJulia();
    return;
  }
  if (polishedFrame) {
    polishedFrame = null;
    juliaKey = '';
    updateControls();
  }
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const aspect = bounds.width / bounds.height;
  const limit = iterationLimit();
  const maxPixels = Math.max(20000, Math.min(fullQualityPanRender ? 650000 : (playing || dragging ? 130000 : 650000), Math.floor(MAX_WORK / limit)));
  const width = Math.max(1, Math.floor(Math.min(bounds.width * displayScale(), Math.sqrt(maxPixels * aspect))));
  const height = Math.max(1, Math.floor(width / aspect));
  buffer.width = width;
  buffer.height = height;
  const image = bufferContext.createImageData(width, height);
  renderPixelRows(image.data, width, height, view, limit, palettes[$('palette').value]);
  bufferContext.putImageData(image, 0, 0);
  const displayWidth = Math.round(bounds.width * displayScale());
  const displayHeight = Math.round(bounds.height * displayScale());
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
  const polishedNow = isPolishedCurrent();
  const samples = polishedNow ? polishedFrame.samples : 1;
  const limit = Math.min(Number($('iterations').value), playing || dragging ? 100 : 220);
  const quality = polishedNow ? `polish-${samples}` : (playing || dragging ? 'low' : 'high');
  const key = `${c.x},${c.y},${limit},${quality},${$('palette').value},${bounds.width},${bounds.height}`;
  if (key === juliaKey) return;
  juliaKey = key;
  lastJuliaDraw = now;
  const aspect = bounds.width / bounds.height;
  const maxPixels = polishedNow ? Number.POSITIVE_INFINITY : (playing || dragging ? 20000 : 70000);
  const width = Math.max(1, Math.floor(Math.min(bounds.width * displayScale(), Math.sqrt(maxPixels * aspect))));
  const height = Math.max(1, Math.floor(width / aspect));
  juliaBuffer.width = width;
  juliaBuffer.height = height;
  const image = juliaBufferContext.createImageData(width, height);
  renderJuliaPixelRows(image.data, width, height, c, limit, palettes[$('palette').value], 0, height, samples, JULIA_SPAN);
  juliaBufferContext.putImageData(image, 0, 0);
  const displayWidth = Math.round(bounds.width * displayScale());
  const displayHeight = Math.round(bounds.height * displayScale());
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

function playingStatus() {
  if (demo) return demoStatus(demo);
  return zoomDirection === 'out' ? 'Zooming out' : 'Zooming in';
}

function zoomLimitMessage(direction = zoomDirection) {
  return direction === 'out' ? 'Overview limit reached' : 'Precision limit reached';
}

function atZoomLimit(direction = zoomDirection) {
  return direction === 'out' ? view.span >= INITIAL_SPAN * 2 : view.span <= MIN_SPAN;
}

function updateControls() {
  const zoomingIn = playing && !demo && zoomDirection !== 'out';
  const zoomingOut = playing && !demo && zoomDirection === 'out';
  const inButton = $('play-in');
  const outButton = $('play-out');
  inButton.textContent = zoomingIn ? 'Ⅱ Pause' : '▶ Zoom in';
  outButton.textContent = zoomingOut ? 'Ⅱ Pause' : '▶ Zoom out';
  inButton.setAttribute('aria-pressed', String(zoomingIn));
  inButton.setAttribute('aria-label', zoomingIn ? 'Pause zooming in' : 'Start zooming in');
  outButton.setAttribute('aria-pressed', String(zoomingOut));
  outButton.setAttribute('aria-label', zoomingOut ? 'Pause zooming out' : 'Start zooming out');
  $('demo').textContent = demo ? 'Stop demo' : 'Start demo';
  $('demo').setAttribute('aria-pressed', String(Boolean(demo)));
  const hint = $('keyboard-hint');
  hint.replaceChildren(document.createElement('kbd'), document.createTextNode(demo ? (playing ? ' to pause demo' : ' to resume demo') : ' to play or pause'));
  hint.querySelector('kbd').textContent = 'Space';
  const polishButton = $('polish');
  polishButton.textContent = polishing ? 'Cancel polish' : '✦ Polish frame';
  polishButton.setAttribute('aria-pressed', String(polishing));
  polishButton.setAttribute('aria-label', polishing ? 'Cancel polished render' : 'Polish this view into a full-resolution frame');
  $('save-frame').disabled = polishing || !polishedFrame;
  canvas.parentElement.setAttribute('aria-busy', String(polishing));
  canvas.parentElement.classList.toggle('signed', Boolean(polishedFrame) && !polishing && $('watermark').checked);
  const badge = polishing ? ' POLISHING' : polishedFrame ? ' POLISHED' : demo ? ' DEMO' : ' LIVE RENDER';
  $('live-badge').replaceChildren(document.createElement('i'), document.createTextNode(badge));
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
    view = zoomAt(view, continuousZoomFactor(elapsed, Number($('speed').value), zoomDirection));
    lastTime = time;
    if (atZoomLimit()) setPlaying(false, zoomLimitMessage());
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
  if (value) cancelPolish();
  playing = value;
  lastTime = 0;
  status = message || (playing ? playingStatus() : (demo ? 'Demo paused' : 'Paused'));
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
  cancelPolish();
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
  cancelPolish();
  const tookOver = releaseDemo();
  view = zoomAt(view, factor, u, v, canvas.clientWidth / canvas.clientHeight);
  if (tookOver) {
    setPlaying(false, 'Paused');
    return;
  }
  status = view.span <= MIN_SPAN ? 'Precision limit reached' : playing ? playingStatus() : 'Paused';
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
  cancelPolish();
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
  status = view.span <= MIN_SPAN ? 'Precision limit reached' : playing ? playingStatus() : 'Paused';
  updateControls();
  updateTelemetry();
  requestDraw();
}

function cancelPolish() {
  polishToken += 1;
  const active = polishing || polishedFrame !== null;
  polishing = false;
  polishedFrame = null;
  juliaKey = '';
  const progress = $('polish-progress');
  progress.setAttribute('aria-hidden', 'true');
  progress.setAttribute('aria-valuenow', '0');
  $('polish-progress-bar').style.width = '0';
  if (active) updateControls();
  return active;
}

function setPolishProgress(fraction) {
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  const progress = $('polish-progress');
  progress.setAttribute('aria-hidden', 'false');
  progress.setAttribute('aria-valuenow', String(percent));
  $('polish-progress-bar').style.width = `${percent}%`;
  status = percent >= 100 ? 'Polished frame' : `Polishing · ${percent}%`;
  updateTelemetry();
}

function startPolish() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) {
    status = 'Unable to polish this view';
    updateTelemetry();
    return;
  }
  releaseDemo();
  playing = false;
  lastTime = 0;
  polishing = true;
  polishedFrame = null;
  const token = ++polishToken;
  const samples = polishSamples();
  const paletteName = $('palette').value;
  const palette = palettes[paletteName];
  const iterations = Number($('iterations').value);
  const snapshot = { x: view.x, y: view.y, span: view.span };
  const width = Math.max(1, Math.round(bounds.width * displayScale()));
  const height = Math.max(1, Math.round(bounds.height * displayScale()));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  polishBuffer.width = width;
  polishBuffer.height = height;
  const image = polishContext.createImageData(width, height);
  const limit = iterationLimit();
  const juliaBounds = juliaCanvas.getBoundingClientRect();
  const juliaSamples = samples;
  const juliaLimit = Math.min(iterations, 220);
  const c = correspondingC(snapshot);
  let juliaWidth = 0;
  let juliaHeight = 0;
  let juliaImage = null;
  if (juliaBounds.width && juliaBounds.height) {
    juliaWidth = Math.max(1, Math.floor(juliaBounds.width * displayScale()));
    juliaHeight = Math.max(1, Math.floor(juliaWidth / (juliaBounds.width / juliaBounds.height)));
    juliaPolishBuffer.width = juliaWidth;
    juliaPolishBuffer.height = juliaHeight;
    juliaImage = juliaPolishContext.createImageData(juliaWidth, juliaHeight);
  }
  let phase = 'mandelbrot';
  let row = 0;
  const rowStep = samples >= 4 ? 1 : samples === 3 ? 2 : 4;
  status = 'Polishing · 0%';
  updateControls();
  setPolishProgress(0);

  const step = () => {
    if (token !== polishToken) return;
    const sliceStart = performance.now();
    while (performance.now() - sliceStart < POLISH_SLICE_MS) {
      if (phase === 'mandelbrot') {
        if (row >= height) {
          phase = 'julia';
          row = 0;
          continue;
        }
        const next = Math.min(height, row + rowStep);
        renderPixelRows(image.data, width, height, snapshot, limit, palette, row, next, samples);
        row = next;
      } else if (!juliaImage || row >= juliaHeight) {
        break;
      } else {
        const next = Math.min(juliaHeight, row + 8);
        renderJuliaPixelRows(juliaImage.data, juliaWidth, juliaHeight, c, juliaLimit, palette, row, next, juliaSamples, JULIA_SPAN);
        row = next;
      }
    }
    if (token !== polishToken) return;
    const mandelbrotRows = phase === 'mandelbrot' ? row : height;
    polishContext.putImageData(image, 0, 0);
    if (mandelbrotRows > 0) {
      context.imageSmoothingEnabled = false;
      context.drawImage(polishBuffer, 0, 0, width, mandelbrotRows, 0, 0, width, mandelbrotRows);
      context.imageSmoothingEnabled = true;
    }
    const juliaDone = !juliaImage || (phase === 'julia' && row >= juliaHeight);
    const juliaFraction = juliaDone ? 1 : phase === 'julia' ? row / juliaHeight : 0;
    setPolishProgress(Math.min(0.99, mandelbrotRows / height * 0.86 + juliaFraction * 0.14));
    const currentBounds = canvas.getBoundingClientRect();
    const resized = Math.abs(Math.round(currentBounds.width * displayScale()) - width) > 1
      || Math.abs(Math.round(currentBounds.height * displayScale()) - height) > 1;
    if (resized || !sameView(snapshot)) {
      cancelPolish();
      status = 'Paused';
      updateControls();
      updateTelemetry();
      requestDraw();
      return;
    }
    if (phase === 'mandelbrot' || (juliaImage && row < juliaHeight)) {
      requestAnimationFrame(step);
      return;
    }
    buffer.width = width;
    buffer.height = height;
    bufferContext.drawImage(polishBuffer, 0, 0);
    rendered = { ...snapshot, width, height };
    if (juliaImage) {
      juliaBuffer.width = juliaWidth;
      juliaBuffer.height = juliaHeight;
      juliaBufferContext.putImageData(juliaImage, 0, 0);
      const displayWidth = Math.round(juliaBounds.width * displayScale());
      const displayHeight = Math.round(juliaBounds.height * displayScale());
      if (juliaCanvas.width !== displayWidth || juliaCanvas.height !== displayHeight) {
        juliaCanvas.width = displayWidth;
        juliaCanvas.height = displayHeight;
      }
      juliaContext.drawImage(juliaBuffer, 0, 0, juliaCanvas.width, juliaCanvas.height);
      juliaKey = `${c.x},${c.y},${juliaLimit},polish-${juliaSamples},${paletteName},${juliaBounds.width},${juliaBounds.height}`;
      const label = formatC(c);
      $('julia-c').textContent = label;
      juliaCanvas.setAttribute('aria-label', `Julia set for the Mandelbrot view center, ${label}`);
    }
    polishing = false;
    polishedFrame = { ...snapshot, width, height, palette: paletteName, iterations, samples };
    $('polish-progress').setAttribute('aria-hidden', 'true');
    $('polish-progress').setAttribute('aria-valuenow', '100');
    status = 'Polished frame';
    updateControls();
    updateTelemetry();
    syncArtworkMark();
  };
  requestAnimationFrame(step);
}

function paintArtworkMark(ctx, width, height, frame) {
  const text = formatArtworkMark(frame).text;
  const bounds = canvas.getBoundingClientRect();
  const scale = width === canvas.width && bounds.width ? width / bounds.width : displayScale();
  let fontSize = Math.max(11, Math.round(13 * scale));
  const padX = Math.round(22 * scale);
  const padY = Math.round(22 * scale);
  const maxWidth = Math.max(40, width - padX - Math.round(108 * scale));
  ctx.save();
  ctx.font = `italic ${fontSize}px Georgia, "Palatino Linotype", Palatino, serif`;
  while (fontSize > 8 && ctx.measureText(text).width > maxWidth) {
    fontSize -= 1;
    ctx.font = `italic ${fontSize}px Georgia, "Palatino Linotype", Palatino, serif`;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(5, 8, 16, 0.45)';
  ctx.shadowBlur = fontSize * 0.9;
  ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.06));
  ctx.fillStyle = 'rgba(244, 236, 220, 0.5)';
  ctx.fillText(text, padX, height - padY);
  ctx.restore();
}

function syncArtworkMark() {
  refreshWatermarkPreview();
  const signed = Boolean(polishedFrame) && !polishing && $('watermark').checked;
  canvas.parentElement.classList.toggle('signed', signed);
  if (polishing || !polishedFrame) return;
  if (polishBuffer.width !== canvas.width || polishBuffer.height !== canvas.height) return;
  context.drawImage(polishBuffer, 0, 0);
  if ($('watermark').checked) paintArtworkMark(context, canvas.width, canvas.height, polishedFrame);
}

function artworkCanvas() {
  if (!$('watermark').checked) return canvas;
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext('2d');
  const clean = polishBuffer.width === canvas.width && polishBuffer.height === canvas.height ? polishBuffer : canvas;
  ctx.drawImage(clean, 0, 0);
  paintArtworkMark(ctx, copy.width, copy.height, polishedFrame || view);
  return copy;
}

function saveArtwork() {
  if ($('save-frame').disabled) return;
  artworkCanvas().toBlob((blob) => {
    if (!blob) {
      status = 'Unable to save artwork';
      updateTelemetry();
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'infinite-mandelbrot.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, 'image/png');
}

function startZoom(direction) {
  cancelPolish();
  const takingOverDemo = demo !== null;
  if (takingOverDemo) demo = null;
  if (!takingOverDemo && playing && zoomDirection === direction) {
    setPlaying(false);
    return;
  }
  zoomDirection = direction;
  if (atZoomLimit(direction)) {
    setPlaying(false, zoomLimitMessage(direction));
    return;
  }
  setPlaying(true);
}

function togglePlaying() {
  if (playing) {
    setPlaying(false);
    return;
  }
  if (!demo && atZoomLimit()) {
    setPlaying(false, zoomLimitMessage());
    return;
  }
  setPlaying(true);
}

$('play-in').addEventListener('click', () => startZoom('in'));
$('play-out').addEventListener('click', () => startZoom('out'));
$('demo').addEventListener('click', () => {
  if (demo) endDemo();
  else beginDemo();
});
$('reset').addEventListener('click', resetView);
$('destination').addEventListener('change', resetView);
function submitCoordinates(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  applyCoordinates();
}
$('coordinate-real').addEventListener('keydown', submitCoordinates);
$('coordinate-imag').addEventListener('keydown', submitCoordinates);
$('coordinate-real').addEventListener('input', (event) => event.currentTarget.removeAttribute('aria-invalid'));
$('coordinate-imag').addEventListener('input', (event) => event.currentTarget.removeAttribute('aria-invalid'));
$('go-coordinates').addEventListener('click', applyCoordinates);
$('zoom-in').addEventListener('click', () => manualZoom(0.5));
$('zoom-out').addEventListener('click', () => manualZoom(2));
$('speed').addEventListener('input', () => {
  $('speed-value').textContent = `${Number($('speed').value).toFixed(1)}×`;
});
$('iterations').addEventListener('input', () => {
  $('iterations-value').textContent = $('iterations').value;
  cancelPolish();
  requestDraw();
});
$('palette').addEventListener('change', () => {
  $('palette-preview').dataset.palette = $('palette').value;
  cancelPolish();
  requestDraw();
});
$('polish').addEventListener('click', () => {
  if (polishing) {
    cancelPolish();
    status = 'Paused';
    updateControls();
    updateTelemetry();
    requestDraw();
    return;
  }
  startPolish();
});
$('save-frame').addEventListener('click', saveArtwork);
$('watermark').addEventListener('change', syncArtworkMark);
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
  togglePlaying();
});
const polishPanel = $('polish-panel');
const polishHome = polishPanel.parentElement;
const polishNext = polishPanel.nextElementSibling;

function syncFullscreenPolish() {
  const viewer = canvas.parentElement;
  if (document.fullscreenElement === viewer) {
    polishPanel.classList.add('overlay');
    viewer.appendChild(polishPanel);
    return;
  }
  polishHome.insertBefore(polishPanel, polishNext);
  polishPanel.classList.remove('overlay');
}

$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await canvas.parentElement.requestFullscreen();
  } catch {
    status = 'Fullscreen unavailable';
    updateTelemetry();
  }
});
document.addEventListener('fullscreenchange', syncFullscreenPolish);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) setPlaying(false);
});
new ResizeObserver(requestDraw).observe(canvas);
const demoQuery = new URLSearchParams(location.search).get('demo');
if (demoQuery !== null && demoQuery !== '0' && demoQuery !== 'false') beginDemo();
else requestDraw();
