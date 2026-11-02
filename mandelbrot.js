export const INITIAL_SPAN = 3.5;
export const MIN_SPAN = INITIAL_SPAN / 1e13;
export const ZOOM_RATE = 0.55;
export const DEMO_ZOOM_RATIO = 48;
export const DEMO_DWELL_SECONDS = 0.75;

export const destinations = {
  overview: { x: -0.5, y: 0, span: INITIAL_SPAN },
  seahorse: { x: -0.743643887037151, y: 0.13182590420533, span: 0.018 },
  elephant: { x: 0.275, y: 0.008, span: 0.08 },
  spiral: { x: -0.761574, y: -0.0847596, span: 0.012 },
};

export const pointsOfInterest = {
  seahorse: { ...destinations.seahorse, label: 'Seahorse valley' },
  elephant: { ...destinations.elephant, label: 'Elephant valley' },
  spiral: { ...destinations.spiral, label: 'Spiral coast' },
};

export const palettes = {
  aurora: [[8, 16, 40], [18, 85, 122], [40, 166, 167], [135, 231, 195], [255, 221, 147], [161, 103, 49]],
  ember: [[17, 10, 44], [87, 34, 139], [181, 53, 126], [244, 107, 66], [255, 221, 157], [105, 43, 89]],
  ocean: [[3, 14, 43], [18, 50, 116], [27, 109, 187], [68, 188, 220], [224, 247, 255], [73, 111, 175]],
};

export const JULIA_SPAN = 4;

export function correspondingC(view) {
  return { x: view.x, y: view.y };
}

export function escapeTime(cx, cy, limit) {
  const q = (cx - 0.25) ** 2 + cy * cy;
  if (q * (q + cx - 0.25) <= 0.25 * cy * cy || (cx + 1) ** 2 + cy * cy <= 0.0625) return -1;
  let x = 0;
  let y = 0;
  let count = 0;
  while (x * x + y * y <= 4 && count < limit) {
    const nextX = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = nextX;
    count++;
  }
  if (count === limit) return -1;
  return count + 1 - Math.log2(Math.log2(x * x + y * y) / 2);
}

export function pointAt(view, u, v, aspect) {
  return { x: view.x + (u - 0.5) * view.span, y: view.y + (0.5 - v) * view.span / aspect };
}

export function zoomAt(view, factor, u = 0.5, v = 0.5, aspect = 1) {
  const anchor = pointAt(view, u, v, aspect);
  const span = Math.max(MIN_SPAN, Math.min(INITIAL_SPAN * 2, view.span * factor));
  return { x: anchor.x - (u - 0.5) * span, y: anchor.y - (0.5 - v) * span / aspect, span };
}

export function continuousZoomFactor(elapsed, speed, direction = 'in') {
  const outward = direction === 'out';
  return Math.exp((outward ? elapsed : -elapsed) * speed * ZOOM_RATE);
}

export function panBy(view, du, dv, aspect = 1) {
  return { x: view.x - du * view.span, y: view.y + dv * view.span / aspect, span: view.span };
}

export function panOffset(from, to, width, height) {
  const aspect = width / height;
  return {
    x: (from.x - to.x) / to.span * width,
    y: (to.y - from.y) * aspect / to.span * height,
  };
}

export function pickPointOfInterest(random = Math.random, avoid) {
  const keys = Object.keys(pointsOfInterest);
  const choices = keys.filter((key) => key !== avoid);
  const pool = choices.length ? choices : keys;
  const index = Math.floor(random() * pool.length);
  return pool[index] ?? pool[0];
}

export function createDemoState(key) {
  const poi = pointsOfInterest[key];
  const home = { x: poi.x, y: poi.y, span: poi.span };
  return {
    key,
    phase: 'in',
    dwell: 0,
    home,
    deepSpan: Math.min(home.span / 2, Math.max(MIN_SPAN * 4, home.span / DEMO_ZOOM_RATIO)),
    view: { ...home },
  };
}

export function startDemo(random = Math.random, avoid) {
  return createDemoState(pickPointOfInterest(random, avoid));
}

function demoFrame(state, span, phase, dwell) {
  return {
    ...state,
    phase,
    dwell,
    home: { ...state.home },
    view: { x: state.home.x, y: state.home.y, span },
  };
}

function stepDemoOnce(state, elapsed, speed, random) {
  if (state.phase === 'dwell-in' || state.phase === 'dwell-out') {
    const dwell = state.dwell + elapsed;
    if (dwell < DEMO_DWELL_SECONDS) return { state: demoFrame(state, state.view.span, state.phase, dwell), relocated: false };
    if (state.phase === 'dwell-in') return { state: demoFrame(state, state.deepSpan, 'out', 0), relocated: false };
    return { state: startDemo(random, state.key), relocated: true };
  }

  const inward = state.phase === 'in';
  const factor = Math.exp((inward ? -elapsed : elapsed) * speed * ZOOM_RATE);
  let span = state.view.span * factor;
  let phase = state.phase;
  if (inward && span <= state.deepSpan) {
    span = state.deepSpan;
    phase = 'dwell-in';
  } else if (!inward && span >= state.home.span) {
    span = state.home.span;
    phase = 'dwell-out';
  }
  return { state: demoFrame(state, span, phase, 0), relocated: false };
}

export function stepDemo(state, elapsed, speed = 1, random = Math.random) {
  const safeElapsed = Math.max(0, Number(elapsed) || 0);
  const safeSpeed = Math.max(0, Number(speed) || 0);
  if (!safeElapsed || !safeSpeed) return { state, relocated: false };
  let current = state;
  let relocated = false;
  let remaining = safeElapsed;
  while (remaining > 0) {
    const dt = Math.min(0.05, remaining);
    const result = stepDemoOnce(current, dt, safeSpeed, random);
    current = result.state;
    relocated = relocated || result.relocated;
    remaining -= dt;
  }
  return { state: current, relocated };
}

function paintSample(pixels, offset, value, palette) {
  if (value < 0) {
    pixels[offset] = 5;
    pixels[offset + 1] = 9;
    pixels[offset + 2] = 18;
  } else {
    const position = (Math.log1p(value) * 2.5) % palette.length;
    const index = Math.floor(position);
    const blend = position - index;
    for (let channel = 0; channel < 3; channel++) {
      pixels[offset + channel] = Math.round(palette[index][channel] * (1 - blend) + palette[(index + 1) % palette.length][channel] * blend);
    }
  }
  pixels[offset + 3] = 255;
}

const sampleColor = new Uint8ClampedArray(4);

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToChannel(value) {
  const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

export function normalizeSamples(samples) {
  const count = Math.floor(Number(samples));
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(count, 8);
}

const EXACT_NUMBER = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';

function formatExact(value) {
  if (Object.is(value, -0)) return '-0';
  return value.toString();
}

export function formatArtworkMark(view) {
  const yNegative = view.y < 0 || Object.is(view.y, -0);
  const location = `${formatExact(view.x)} ${yNegative ? '-' : '+'} ${formatExact(Math.abs(view.y))}i`;
  const magnification = formatExact(INITIAL_SPAN / view.span);
  const span = formatExact(view.span);
  return {
    location,
    magnification: `${magnification}×`,
    span,
    text: `re ${formatExact(view.x)}\nim ${formatExact(view.y)}\n${magnification}×\nspan ${span}`,
  };
}

export function parseArtworkMark(text) {
  const match = String(text).trim().match(new RegExp(`^re (${EXACT_NUMBER})\\nim (${EXACT_NUMBER})\\n(${EXACT_NUMBER})×\\nspan (${EXACT_NUMBER})$`));
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const magnification = Number(match[3]);
  const span = Number(match[4]);
  if (![x, y, magnification, span].every(Number.isFinite) || magnification <= 0 || span <= 0) return null;
  return { x, y, span, magnification };
}

function paintAveraged(pixels, offset, values, palette) {
  const first = values[0];
  for (let index = 1; index < values.length; index++) {
    if (values[index] !== first) {
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sample = 0; sample < values.length; sample++) {
        paintSample(sampleColor, 0, values[sample], palette);
        red += channelToLinear(sampleColor[0]);
        green += channelToLinear(sampleColor[1]);
        blue += channelToLinear(sampleColor[2]);
      }
      const count = values.length;
      pixels[offset] = linearToChannel(red / count);
      pixels[offset + 1] = linearToChannel(green / count);
      pixels[offset + 2] = linearToChannel(blue / count);
      pixels[offset + 3] = 255;
      return;
    }
  }
  paintSample(pixels, offset, first, palette);
}

function renderSampledRows(pixels, width, height, step, left, top, limit, palette, samples, startRow, endRow, sampleAt) {
  if (width <= 0 || height <= 0 || step === 0) return;
  const count = normalizeSamples(samples);
  const rowStart = Math.max(0, Math.min(height, startRow | 0));
  const rowEnd = Math.max(rowStart, Math.min(height, endRow === undefined ? height : endRow | 0));
  const values = count > 1 ? new Array(count * count) : null;
  for (let row = rowStart; row < rowEnd; row++) {
    for (let col = 0; col < width; col++) {
      const offset = (row * width + col) * 4;
      if (count === 1) {
        paintSample(pixels, offset, sampleAt(left + (col + 0.5) * step, top - (row + 0.5) * step, limit), palette);
        continue;
      }
      let index = 0;
      for (let sy = 0; sy < count; sy++) {
        const y = top - (row + (sy + 0.5) / count) * step;
        for (let sx = 0; sx < count; sx++) {
          values[index++] = sampleAt(left + (col + (sx + 0.5) / count) * step, y, limit);
        }
      }
      paintAveraged(pixels, offset, values, palette);
    }
  }
}

export function juliaEscapeTime(zx, zy, cx, cy, limit) {
  let x = zx;
  let y = zy;
  let count = 0;
  while (x * x + y * y <= 4 && count < limit) {
    const nextX = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = nextX;
    count++;
  }
  if (count === limit) return -1;
  return count + 1 - Math.log2(Math.log2(x * x + y * y) / 2);
}

export function renderPixelRows(pixels, width, height, view, limit, palette, startRow = 0, endRow = height, samples = 1) {
  const step = view.span / width;
  renderSampledRows(
    pixels,
    width,
    height,
    step,
    view.x - view.span / 2,
    view.y + view.span * height / width / 2,
    limit,
    palette,
    samples,
    startRow,
    endRow,
    (x, y, iterationLimit) => escapeTime(x, y, iterationLimit),
  );
}

export function renderPixels(pixels, width, height, view, limit, palette, samples = 1) {
  renderPixelRows(pixels, width, height, view, limit, palette, 0, height, samples);
}

export function renderJuliaPixelRows(pixels, width, height, c, limit, palette, startRow = 0, endRow = height, samples = 1, span = JULIA_SPAN) {
  const step = span / width;
  renderSampledRows(
    pixels,
    width,
    height,
    step,
    -span / 2,
    span * height / width / 2,
    limit,
    palette,
    samples,
    startRow,
    endRow,
    (x, y, iterationLimit) => juliaEscapeTime(x, y, c.x, c.y, iterationLimit),
  );
}

export function renderJuliaPixels(pixels, width, height, c, limit, palette, span = JULIA_SPAN, samples = 1) {
  renderJuliaPixelRows(pixels, width, height, c, limit, palette, 0, height, samples, span);
}
