export const INITIAL_SPAN = 3.5;
export const MIN_SPAN = INITIAL_SPAN / 1e13;

export const destinations = {
  overview: { x: -0.5, y: 0, span: INITIAL_SPAN },
  seahorse: { x: -0.743643887037151, y: 0.13182590420533, span: 0.018 },
  elephant: { x: 0.275, y: 0.008, span: 0.08 },
  spiral: { x: -0.761574, y: -0.0847596, span: 0.012 },
};

export const palettes = {
  aurora: [[8, 16, 40], [18, 85, 122], [40, 166, 167], [135, 231, 195], [255, 221, 147], [161, 103, 49]],
  ember: [[17, 10, 44], [87, 34, 139], [181, 53, 126], [244, 107, 66], [255, 221, 157], [105, 43, 89]],
  ocean: [[3, 14, 43], [18, 50, 116], [27, 109, 187], [68, 188, 220], [224, 247, 255], [73, 111, 175]],
};

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

export function renderPixels(pixels, width, height, view, limit, palette) {
  const step = view.span / width;
  const left = view.x - view.span / 2;
  const top = view.y + view.span * height / width / 2;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const value = escapeTime(left + (col + 0.5) * step, top - (row + 0.5) * step, limit);
      const offset = (row * width + col) * 4;
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
  }
}
