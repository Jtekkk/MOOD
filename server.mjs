// Minimal zero-dependency static file server for local play.
// Usage: node server.mjs  →  open http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

// Build the static-file server (not yet listening). Reused by the Electron
// desktop wrapper (electron/main.js) and the CLI entry point below.
export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (urlPath === '/') urlPath = '/index.html';
      const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = join(root, safe);
      if (!filePath.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 not found');
    }
  });
}

// Start listening; resolves with the server + the actual bound port (pass 0
// for an ephemeral free port, which the desktop wrapper uses).
export function startServer(port = PORT, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = createStaticServer();
    server.listen(port, host, () => resolve({ server, port: server.address().port }));
  });
}

// Run directly (`node server.mjs`) → serve on PORT for local play.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createStaticServer().listen(PORT, () => console.log(`MOOD running at http://localhost:${PORT}`));
}
