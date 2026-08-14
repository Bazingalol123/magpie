// Minimal static file server for tests-e2e/fixtures/, spawned as its own
// child process by global-setup.ts (so global-teardown.ts can kill it by
// PID independently of the base44 dev process). Deliberately dependency-free
// per the issue #19 Phase 1 decision ("plain Node http module is fine, no
// new dependency needed") — this is a handful of static HTML fixture pages,
// not a real app server.
//
// Usage: node fixtures-server.mjs <port> <rootDir>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2]);
const rootDir = path.resolve(process.argv[3]);

if (!Number.isInteger(port) || !fs.existsSync(rootDir)) {
  console.error(`Usage: node fixtures-server.mjs <port> <rootDir> (got port=${process.argv[2]}, rootDir=${process.argv[3]})`);
  process.exit(1);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relativePath = requestPath === "/" ? "/index.html" : requestPath;
  const resolved = path.normalize(path.join(rootDir, relativePath));

  if (!resolved.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`Not found: ${relativePath}`);
      return;
    }
    const contentType = MIME_TYPES[path.extname(resolved)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[fixtures-server] listening on http://127.0.0.1:${port} (serving ${rootDir})`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
