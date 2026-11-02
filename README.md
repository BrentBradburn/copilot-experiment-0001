# Infinite — Mandelbrot Explorer

A dependency-free web application for exploring the Mandelbrot set with smooth
animated zooming, destination presets, adjustable detail and three color palettes.
A smaller view shows the Julia set for the center of the Mandelbrot image.

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
- Click **Zoom in** or **Zoom out** to animate toward or away from the view’s center. Click the active direction again, or press **Space**, to pause. **Space** resumes the last direction.
- Drag the image to pan. The current frame follows the pointer immediately, then the view re-renders.
- Scroll over the image to zoom toward the pointer, or use the **+ / −** buttons.
- Click the image to zoom in while keeping the point under the pointer fixed.
- Select a destination or **Reset view** to return to a preset.
- Adjust zoom speed, iteration detail, and palette while exploring.
- Click **Polish frame** to re-render the current view in place at screen resolution. Choose **Frame quality** to add 2×2, 3×3, or 4×4 samples per pixel, which smooths the aliasing left by the live preview. Cancel from the same button. **Save artwork** downloads the finished still. Check **Location watermark** to add a faint center, magnification, and horizontal span — on the polished frame and in the saved PNG — so that view can be found again. Magnification is the initial width 3.5 divided by the horizontal span.
- Use **⛶** to expand the visualization to fullscreen. Frame quality, **Polish frame**, and **Save artwork** stay on the image so a fullscreen view can be polished and downloaded the same way.
- Watch the smaller **Live Julia** view: it is the Julia set for the center of the Mandelbrot image and updates as you pan, zoom, or play.

Animation renders at reduced resolution for responsiveness; pausing restores
detail. A polished frame removes that resolution cap and supersamples each pixel.
Higher iteration counts reveal more boundary structure but take longer
to render; iteration detail also increases automatically at deeper zooms.
Zooming stops at 10¹³×, before floating-point precision becomes
unreliable. Animation pauses when the tab is hidden.

## Tests

```sh
npm test
```

Tests use Node’s built-in test runner to check escape calculations, pixel colors,
coordinate mapping, pointer-anchored zooming, panning, zoom limits, the demo tour,
animated zoom in and out, the side-by-side zoom controls, polished supersampled frames,
fullscreen polish and save, the optional location watermark, and the Julia set that corresponds to the current view center.