import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/style.css': ['style.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript'],
  '/mandelbrot.js': ['mandelbrot.js', 'text/javascript'],
};
const port = Number(process.env.PORT || 3000);
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = files[path];
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, {
      'Content-Type': `${file[1]}; charset=utf-8`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end('Unable to load application');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Mandelbrot explorer running at http://localhost:${port}`);
});
