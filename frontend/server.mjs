import { createServer, request as httpRequest } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.env.STATIC_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "dist"));
const port = Number(process.env.PORT ?? 8080);
const apiHost = process.env.API_HOST ?? "backend";
const apiPort = Number(process.env.API_PORT ?? 5000);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function proxy(req, res) {
  const upstream = httpRequest({
    hostname: apiHost,
    port: apiPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${apiHost}:${apiPort}` },
  }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error("API timeout")));
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "API unavailable" }));
  });
  req.pipe(upstream);
}

async function serve(req, res) {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "lablink-web" }));
    return;
  }
  if (req.url?.startsWith("/api/") || req.url === "/api") {
    proxy(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  let file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  let fileStat;
  try {
    fileStat = await stat(file);
    if (fileStat.isDirectory()) {
      file = resolve(root, "index.html");
      fileStat = await stat(file);
    }
  } catch {
    if (!req.headers.accept?.includes("text/html") || extname(pathname)) {
      res.writeHead(404);
      res.end();
      return;
    }
    file = resolve(root, "index.html");
    fileStat = await stat(file);
  }
  res.writeHead(200, {
    "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    "Content-Length": fileStat.size,
    "Cache-Control": file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

createServer((req, res) => {
  void serve(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`LabLink web listening on port ${port}`);
});
