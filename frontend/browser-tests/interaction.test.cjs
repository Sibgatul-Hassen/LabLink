const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const { cp, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { existsSync: fileExists } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { test } = require("node:test");

const browser = [
  process.env.CHROME_BIN,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((path) => path && fileExists(path));

function listen(server) {
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server.address().port)));
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch { /* Startup in progress. */ }
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error("Frontend server did not start");
}

const browserRun = `
(async () => {
  const result = document.createElement("pre");
  result.id = "browser-test-result";
  document.body.append(result);
  const wait = async (predicate, label) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const found = predicate();
      if (found) return found;
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error("Timed out: " + label + " at " + location.pathname);
  };
  const fill = (input, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const button = (label) => [...document.querySelectorAll("button")]
    .find((item) => item.textContent.trim() === label);
  try {
    const email = await wait(() => document.querySelector("#email"), "login form");
    fill(email, "sysadmin@uiu.ac.bd");
    fill(document.querySelector("#password"), "Password123!");
    button("Sign in").click();
    await wait(() => location.pathname === "/dashboard", "login navigation");

    document.querySelector('a[href="/penalties"]').click();
    const rate = await wait(() => [...document.querySelectorAll("label")]
      .find((item) => item.textContent.includes("Amount per late day"))?.querySelector("input"), "rate form");
    fill(rate, "10");
    const threshold = [...document.querySelectorAll("label")]
      .find((item) => item.textContent.includes("Personal requisition block threshold"))?.querySelector("input");
    if (!threshold) throw new Error("threshold input missing");
    fill(threshold, "50");
    button("Save rate").click();
    await wait(() => document.body.textContent.includes("Penalty rate saved."), "rate save");

    document.querySelector('a[href="/damage-reports"]').click();
    await wait(() => button("Start maintenance"), "damage report");
    button("Start maintenance").click();
    await wait(() => button("Mark repaired"), "maintenance transition");
    button("Mark repaired").click();
    await wait(() => document.body.textContent.includes("marked repaired"), "repair transition");

    document.querySelector('a[href="/suggestions"]').click();
    await wait(() => button("Accept"), "suggestion review");
    button("Accept").click();
    await wait(() => document.body.textContent.includes("Suggestion accepted."), "suggestion acceptance");

    document.querySelector('a[href="/requisitions"]').click();
    await wait(() => button("Issue"), "ready requisition");
    button("Issue").click();
    await wait(() => button("Confirm Issue"), "issue preview");
    button("Confirm Issue").click();
    await wait(() => button("Return"), "issued requisition");
    button("Return").click();
    const good = await wait(() => document.querySelector('input[aria-label="goodQty for METER"]'), "return preview");
    await wait(() => good.value === "2", "return defaults");
    fill(good, "1");
    fill(document.querySelector('input[aria-label="damagedQty for METER"]'), "1");
    button("Record Return").click();
    await wait(() => document.body.textContent.includes("Return recorded"), "return confirmation");

    button("Logout").click();
    const studentEmail = await wait(() => document.querySelector("#email"), "student login");
    fill(studentEmail, "student@uiu.ac.bd");
    fill(document.querySelector("#password"), "Password123!");
    button("Sign in").click();
    await wait(() => location.pathname === "/dashboard", "student navigation");
    document.querySelector('a[href="/requisitions"]').click();
    await wait(() => document.body.textContent.includes("Outstanding penalties have reached"), "student penalty block");
    if (!button("New Requisition")?.disabled) throw new Error("blocked personal button remained enabled");
    [...document.querySelectorAll('a[href="/penalties"]')].at(-1).click();
    await wait(() => location.pathname === "/penalties" && document.body.textContent.includes("Penalties"), "penalty link keeps session");
    result.dataset.status = "passed";
    result.textContent = "Browser interactions passed";
  } catch (error) {
    result.dataset.status = "failed";
    result.textContent = String(error.stack || error);
  }
})();
`;

(browser ? test : test.skip)("built UI handles penalties, repair, suggestions, issue, return, and personal blocks", async () => {
  const work = await mkdtemp(join(tmpdir(), "lablink-browser-"));
  const staticRoot = join(work, "static");
  const profile = join(work, "profile");
  const events = [];
  let damageStatus = "REPORTED";
  let suggestionStatus = "PENDING";
  let requisitionStatus = "READY";
  let currentRole = "SYSTEM_ADMIN";
  let web;
  const damage = () => ({
    id: "damage-1", componentId: "component-1", requisitionId: "request-1", qty: 1,
    status: damageStatus, notes: null, createdAt: "2026-09-26T00:00:00.000Z",
    component: { id: "component-1", code: "METER", name: "Multimeter" },
    reportedBy: { id: "student-1", fullName: "Student" },
  });
  const suggestion = () => ({
    id: "suggestion-1", type: "SHORTAGE_ALERT", targetRole: "CENTRAL_STORE_OFFICER",
    payload: { componentCode: "METER" }, evidence: { onHand: 1, reorderPoint: 5 },
    status: suggestionStatus, createdAt: "2026-09-26T00:00:00.000Z", feedback: [],
  });
  const requisition = () => ({
    id: "request-1", type: "PERSONAL", origin: "LAB_ASSISTANT", classSessionId: null,
    requestedById: "student-1", departmentId: "cse",
    neededFrom: "2026-09-26T09:00:00.000Z", neededTo: "2026-09-26T11:00:00.000Z",
    status: requisitionStatus, createdAt: "2026-09-25T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    requestedBy: { id: "student-1", fullName: "Student" },
    department: { id: "cse", code: "CSE", name: "Computer Science" },
    classSession: null,
    lines: [{
      id: "line-1", requisitionId: "request-1", componentId: "component-1", qtyNeeded: 2,
      qtyOwnQuota: 2, qtySubstitute: 0, qtySpare: 0, qtyBorrowed: 0, qtyShort: 0,
      qtyIssued: requisitionStatus === "READY" ? 0 : 2,
      qtyReturnedGood: 0, qtyDamaged: 0, qtyLost: 0, qtyUsedUp: 0,
      component: { id: "component-1", code: "METER", name: "Multimeter", unit: "pcs", sizeClass: "EXPENSIVE" },
      allocations: [],
    }],
  });
  const api = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const url = new URL(req.url, "http://localhost");
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      events.push({ method: req.method, path: url.pathname, body });
      let data = {};
      if (url.pathname === "/api/auth/login") {
        currentRole = body.email === "student@uiu.ac.bd" ? "STUDENT" : "SYSTEM_ADMIN";
        data = {
          token: "test-token", user: currentRole === "STUDENT"
            ? { id: "student-1", email: "student@uiu.ac.bd", fullName: "Student",
              role: "STUDENT", departmentId: "cse", departmentCode: "CSE" }
            : { id: "admin-1", email: "sysadmin@uiu.ac.bd", fullName: "System Admin",
              role: "SYSTEM_ADMIN", departmentId: null, departmentCode: null },
        };
      }
      else if (url.pathname === "/api/components") data = { data: [], total: 0, page: 1, limit: 20 };
      else if (url.pathname === "/api/notifications") data = { data: [] };
      else if (url.pathname === "/api/penalty-rates" && req.method === "GET") data = { data: [] };
      else if (url.pathname === "/api/penalty-rates") data = { data: { id: "rate-1", ...body } };
      else if (url.pathname === "/api/penalties") data = { data: [], total: 0, page: 1, limit: 20 };
      else if (url.pathname === "/api/penalties/block-status") data = {
        blocked: currentRole === "STUDENT",
        outstandingTotal: currentRole === "STUDENT" ? "50.00" : "0.00",
        threshold: "50.00",
      };
      else if (url.pathname === "/api/requisitions" && url.searchParams.get("status") === "RETURNED") data = { data: [], total: 0, page: 1, limit: 20 };
      else if (url.pathname === "/api/requisitions") data = { data: [requisition()], total: 1, page: 1, limit: 10 };
      else if (url.pathname === "/api/requisitions/request-1/issue-preview") data = {
        data: { requisitionId: "request-1", status: "READY", lines: [{ lineId: "line-1",
          componentId: "component-1", componentCode: "METER", componentName: "Multimeter",
          qtyNeeded: 2, currentStock: 5, isSubstitute: false }] },
      };
      else if (url.pathname === "/api/requisitions/request-1/issue") {
        requisitionStatus = "ISSUED"; data = { data: requisition() };
      } else if (url.pathname === "/api/requisitions/request-1/return-preview") data = {
        data: { requisitionId: "request-1", status: "ISSUED", lines: [{ lineId: "line-1",
          componentId: "component-1", componentCode: "METER", componentName: "Multimeter",
          qtyIssued: 2, isSubstitute: false }] },
      };
      else if (url.pathname === "/api/requisitions/request-1/return") {
        requisitionStatus = "RETURNED"; data = { data: requisition() };
      }
      else if (url.pathname === "/api/damage-reports") data = { data: [damage()], total: 1, page: 1, limit: 20 };
      else if (url.pathname === "/api/damage-reports/damage-1") {
        damageStatus = body.status; data = { data: damage() };
      } else if (url.pathname === "/api/suggestions") data = { data: [suggestion()], total: 1, page: 1, limit: 20 };
      else if (url.pathname === "/api/suggestions/suggestion-1/decision") {
        suggestionStatus = body.accepted ? "ACCEPTED" : "DISMISSED";
        data = { data: suggestion() };
      } else { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    });
  });
  try {
    const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
      cwd: resolve(__dirname, ".."), env: { ...process.env, VITE_API_URL: "" },
      encoding: "utf8", shell: process.platform === "win32", timeout: 120000,
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    assert.equal(fileExists(resolve(__dirname, "../dist/index.html")), true);
    await cp(resolve(__dirname, "../dist"), staticRoot, { recursive: true });
    const indexPath = join(staticRoot, "index.html");
    const index = await readFile(indexPath, "utf8");
    await writeFile(indexPath, index.replace("</body>", '<script src="/browser-run.js"></script></body>'));
    await writeFile(join(staticRoot, "browser-run.js"), browserRun);

    const apiPort = await listen(api);
    const portReservation = createServer();
    const webPort = await listen(portReservation);
    await new Promise((done) => portReservation.close(done));
    web = spawn(process.execPath, [resolve(__dirname, "../server.mjs")], {
      env: { ...process.env, STATIC_ROOT: staticRoot, PORT: String(webPort),
        API_HOST: "127.0.0.1", API_PORT: String(apiPort) },
      stdio: "ignore", windowsHide: true,
    });
    await waitForHealth(webPort);

    const chrome = spawn(browser, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
      "--disable-background-networking", `--user-data-dir=${profile}`,
      "--virtual-time-budget=15000", "--dump-dom", `http://127.0.0.1:${webPort}/login`,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    chrome.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const exitCode = await new Promise((done, reject) => {
      const timer = setTimeout(() => { chrome.kill(); reject(new Error("Browser timed out")); }, 35000);
      chrome.once("close", (code) => { clearTimeout(timer); done(code); });
      chrome.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    assert.equal(exitCode, 0, stderr.slice(-1000));
    assert.match(stdout, /id="browser-test-result"[^>]*data-status="passed"/, stdout.slice(-1500));
    assert(events.some((event) => event.method === "PUT" && event.path === "/api/penalty-rates" && event.body.blockThreshold === 50));
    assert.deepEqual(events.filter((event) => event.method === "PATCH" && event.path === "/api/damage-reports/damage-1")
      .map((event) => event.body.status), ["UNDER_MAINTENANCE", "REPAIRED"]);
    assert(events.some((event) => event.method === "PATCH" && event.path === "/api/suggestions/suggestion-1/decision" && event.body.accepted === true));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/requisitions/request-1/issue"));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/requisitions/request-1/return" &&
      event.body.items[0].goodQty === 1 && event.body.items[0].damagedQty === 1));
  } finally {
    if (web) {
      web.kill();
      if (web.exitCode === null) await new Promise((done) => web.once("exit", done));
    }
    await new Promise((done) => api.close(done));
    await rm(work, { recursive: true, force: true });
  }
});
