const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdtemp, mkdir, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { test } = require("node:test");

function listen(server) {
  return new Promise((resolvePort) => server.listen(0, "127.0.0.1", () => {
    resolvePort(server.address().port);
  }));
}

test("production web server serves SPA routes and forwards API methods and bodies", async () => {
  const staticRoot = await mkdtemp(join(tmpdir(), "lablink-web-"));
  const upstream = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ method: req.method, path: req.url, body: Buffer.concat(chunks).toString() }));
    });
  });
  let child;
  try {
    await writeFile(join(staticRoot, "index.html"), "<html>LabLink app</html>");
    await mkdir(join(staticRoot, "assets"));
    await writeFile(join(staticRoot, "assets", "app.js"), "export const app = true;");
    const apiPort = await listen(upstream);
    const reservation = createServer();
    const port = await listen(reservation);
    await new Promise((resolveClose) => reservation.close(resolveClose));
    child = spawn(process.execPath, [resolve(__dirname, "../server.mjs")], {
      env: { ...process.env, STATIC_ROOT: staticRoot, PORT: String(port), API_HOST: "127.0.0.1", API_PORT: String(apiPort) },
      stdio: "ignore",
    });
    const base = `http://127.0.0.1:${port}`;
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(`${base}/health`);
        healthy = response.ok;
        if (healthy) break;
      } catch { /* The child has not started yet. */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.equal(healthy, true, "web server started");

    const spa = await fetch(`${base}/requisitions`, { headers: { Accept: "text/html" } });
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /LabLink app/);
    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
    const missing = await fetch(`${base}/assets/missing.js`, { headers: { Accept: "text/html" } });
    assert.equal(missing.status, 404);

    const api = await fetch(`${base}/api/penalties/assess`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer example" },
      body: JSON.stringify({ type: "LATE" }),
    });
    assert.equal(api.status, 201);
    assert.deepEqual(await api.json(), {
      method: "POST", path: "/api/penalties/assess", body: '{"type":"LATE"}',
    });
  } finally {
    if (child) {
      child.kill();
      await new Promise((resolveExit) => child.once("exit", resolveExit));
    }
    await new Promise((resolveClose) => upstream.close(resolveClose));
    await rm(staticRoot, { recursive: true, force: true });
  }
});
