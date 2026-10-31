# Infinite — Mandelbrot Explorer

A dependency-free web application for exploring the Mandelbrot set with smooth
animated zooming, destination presets, adjustable detail and three color palettes.

## Run

With Node.js 20 or newer:

```sh
npm start
```

Open http://localhost:3000. Set `PORT` to use another port. No installation or build
step is needed. The application files can also be hosted on any static web server.
The included server is for local development, not production deployment.
Add `?demo` to the URL to start in demo mode.

## Explore

- Click **Start demo** to tour known points of interest. The viewer picks one at random, zooms in, then zooms back out, and repeats until you stop it or take control.
- Click **Start zooming** (or press **Space**) to animate toward the view’s center.
- Scroll over the image to zoom toward the pointer, or use the **+ / −** buttons.
- Click the image to recenter and zoom into a feature.
- Select a destination or **Reset view** to return to a preset.
- Adjust zoom speed, iteration detail, and palette while exploring.
- Use **⛶** to expand the visualization to fullscreen.

Animation renders at reduced resolution for responsiveness; pausing restores
detail. Higher iteration counts reveal more boundary structure but take longer
to render; iteration detail also increases automatically at deeper zooms.
Zooming stops at 10¹³×, before floating-point precision becomes
unreliable. Animation pauses when the tab is hidden.

## Tests

```sh
npm test
```

Tests use Node’s built-in test runner to check escape calculations, pixel colors,
coordinate mapping, pointer-anchored zooming, zoom limits, and the demo tour.