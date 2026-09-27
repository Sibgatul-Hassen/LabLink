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
  const runtimeErrors = [];
  window.addEventListener("error", (event) => runtimeErrors.push(String(event.error || event.message)));
  window.addEventListener("unhandledrejection", (event) => runtimeErrors.push(String(event.reason)));
  const wait = async (predicate, label) => {
    for (let attempt = 0; attempt < 400; attempt += 1) {
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
  const select = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const fillTextArea = (input, text) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const button = (label) => [...document.querySelectorAll("button")]
    .find((item) => item.textContent.trim() === label);
  const navigate = async (href) => {
    const link = await wait(() => document.querySelector('a[href="' + href + '"]'), href + " link");
    link.click();
    await wait(() => location.pathname === href, href + " navigation");
  };
  try {
    const email = await wait(() => document.querySelector("#email"), "login form");
    fill(email, "sysadmin@uiu.ac.bd");
    fill(document.querySelector("#password"), "Password123!");
    button("Sign in").click();
    await wait(() => location.pathname === "/dashboard", "login navigation");

    const themeToggle = await wait(() => document.querySelector('button[aria-label="Switch to dark mode"]'), "theme switch");
    themeToggle.click();
    await wait(() => document.documentElement.dataset.theme === "dark", "dark theme");
    document.querySelector('button[aria-label="Switch to light mode"]').click();
    await wait(() => document.documentElement.dataset.theme === "light", "light theme");

    document.querySelectorAll('button[aria-label="Search pages"]')[1].click();
    const commandInput = await wait(() => document.querySelector('input[placeholder="Search pages..."]'), "page search");
    fill(commandInput, "Penalty");
    await wait(() => [...document.querySelectorAll('[role="dialog"] button')].some((item) => item.textContent.trim() === "Penalty Configuration"), "command result");
    document.querySelector('button[aria-label="Close search"]').click();

    const mobileMenu = await wait(() => document.querySelector('button[aria-label="Open navigation"]'), "mobile menu");
    mobileMenu.click();
    await wait(() => mobileMenu.getAttribute("aria-expanded") === "true", "mobile navigation open");
    document.querySelector('a[href="/penalties"]').click();
    await wait(() => location.pathname === "/penalties", "penalties navigation");

    const rate = await wait(() => [...document.querySelectorAll("label")]
      .find((item) => item.textContent.includes("Amount per late day"))?.querySelector("input"), "rate form");
    fill(rate, "10");
    const threshold = [...document.querySelectorAll("label")]
      .find((item) => item.textContent.includes("Personal requisition block threshold"))?.querySelector("input");
    if (!threshold) throw new Error("threshold input missing");
    fill(threshold, "50");
    button("Save rate").click();
    await wait(() => document.body.textContent.includes("Penalty rate saved."), "rate save");

    for (const operationalPath of ["/purchase-requests", "/requisitions", "/stocks", "/quotas", "/damage-reports", "/components", "/courses"]) {
      if (document.querySelector('nav[aria-label="Main navigation"] a[href="' + operationalPath + '"]')) {
        throw new Error("System admin operational link was visible: " + operationalPath);
      }
    }
    history.pushState({}, "", "/purchase-requests");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await wait(() => location.pathname === "/dashboard", "system admin direct route blocked");
    button("Logout").click();
    const labEmail = await wait(() => document.querySelector("#email"), "lab assistant login");
    fill(labEmail, "labasst@uiu.ac.bd");
    fill(document.querySelector("#password"), "Password123!");
    button("Sign in").click();
    await wait(() => location.pathname === "/dashboard", "lab assistant navigation");

    await navigate("/damage-reports");
    await wait(() => button("Start maintenance"), "damage report");
    button("Start maintenance").click();
    await wait(() => button("Mark repaired"), "maintenance transition");
    button("Mark repaired").click();
    await wait(() => document.body.textContent.includes("marked repaired"), "repair transition");

    button("Logout").click();
    const centralEmail = await wait(() => document.querySelector("#email"), "central login");
    fill(centralEmail, "central@uiu.ac.bd");
    fill(document.querySelector("#password"), "Password123!");
    button("Sign in").click();
    await wait(() => location.pathname === "/dashboard", "central navigation");
    await navigate("/damage-reports");
    if (button("Start maintenance") || button("Mark repaired")) throw new Error("Central maintenance action was visible");

    await navigate("/suggestions");
    await wait(() => button("Accept"), "suggestion review");
    button("Accept").click();
    await wait(() => document.body.textContent.includes("Suggestion accepted."), "suggestion acceptance");

    await navigate("/requisitions");
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

    await navigate("/stocks");
    const transferButton = await wait(() => button("Transfer"), "stock transfer action");
    transferButton.click();
    const transferDialog = await wait(() => document.querySelector('[role="dialog"]:has(select option[value="cse"])'), "transfer dialog");
    select(transferDialog.querySelectorAll("select")[0], "cse");
    select(transferDialog.querySelectorAll("select")[1], "eee");
    fill(transferDialog.querySelector('input[type="number"]'), "1");
    button("Transfer allocation").click();
    await wait(() => !document.querySelector('[role="dialog"]'), "transfer complete");

    await navigate("/quotas");
    await wait(() => button("Generate Suggestions"), "quota action");
    button("Generate Suggestions").click();
    const quotaDialog = await wait(() => document.querySelector('[role="dialog"]:has(select option[value="cse"])'), "quota dialog");
    select(quotaDialog.querySelector("select"), "cse");
    quotaDialog.querySelector('button[type="submit"]').click();
    await wait(() => document.body.textContent.includes("1 suggestions from 2 peak groups"), "quota suggestions generated");
    document.querySelector('button[aria-label="Close quota suggestions"]').click();

    await navigate("/purchase-requests");
    await wait(() => button("New Purchase Request"), "purchase action");
    button("New Purchase Request").click();
    const purchaseDialog = await wait(() => document.querySelector('[role="dialog"]:has(select option[value="component-1"])'), "purchase form");
    select(purchaseDialog.querySelector("select"), "component-1");
    fill(purchaseDialog.querySelector('input[type="number"]'), "2");
    fillTextArea(purchaseDialog.querySelector("textarea"), "QA replacement item");
    button("Create request").click();
    await wait(() => !document.querySelector('[role="dialog"]'), "purchase created");
    button("Reconcile pending").click();
    const aggregateDialog = await wait(() => document.querySelector('[role="dialog"]:has(select option[value="component-1"])'), "aggregate form");
    select(aggregateDialog.querySelector("select"), "component-1");
    button("Reconcile").click();
    await wait(() => !document.querySelector('[role="dialog"]'), "purchase reconciliation complete");

    const receiveButton = await wait(() => button("Receive Goods"), "approved purchase receipt action");
    receiveButton.click();
    const poNumber = await wait(() => document.querySelector("#receive-po-number"), "receipt form");
    fill(poNumber, "PO-QA-001");
    fill(document.querySelector("#receive-qty"), "2");
    button("Record Receipt").click();
    await wait(() => document.body.textContent.includes("Stock has increased by 2"), "receipt stock feedback");
    await navigate("/components");
    await wait(() => [...document.querySelectorAll("tr")].some((row) =>
      row.textContent.includes("METER") && row.querySelectorAll("td")[6]?.textContent.trim() === "7"), "component stock after receipt");

    const pages = [
      ["/dashboard", "Welcome back"], ["/components", "Components"],
      ["/stocks", "Stock Management"], ["/quotas", "Department Quotas"],
      ["/courses", "Courses"], ["/sections", "Sections"], ["/labs", "Labs"],
      ["/routine-slots", "Routine Slots"], ["/experiments", "Experiments"],
      ["/sessions", "Class Sessions"], ["/peak-classes", "Peak Class Load"],
      ["/analytics", "Analytics"], ["/purchase-requests", "Purchase Requests"],
      ["/damage-reports", "Damage reports"], ["/suggestions", "Suggestions"],
      ["/penalties", "Penalties"], ["/requisitions", "Requisitions"],
    ];
    for (const [href, heading] of pages) {
      await navigate(href);
      await wait(() => [...document.querySelectorAll('.app-content h1, .app-content h2')]
        .some((node) => node.textContent.includes(heading)), heading + " screen");
    }
    await navigate("/components");
    await wait(() => button("Delete"), "component delete action");
    button("Delete").click();
    const confirmDialog = await wait(() => [...document.querySelectorAll('[role="dialog"]')]
      .find((node) => node.textContent.includes("Delete Multimeter")), "custom confirmation dialog");
    [...confirmDialog.querySelectorAll("button")].find((item) => item.textContent.trim() === "Cancel").click();
    await wait(() => ![...document.querySelectorAll('[role="dialog"]')]
      .some((node) => node.textContent.includes("Delete Multimeter")), "confirmation cancelled");
    if (runtimeErrors.length) throw new Error("Browser runtime errors: " + runtimeErrors.join(" | "));

    button("Logout").click();
    const studentEmail = await wait(() => document.querySelector("#email"), "student login");
    fill(studentEmail, "student@uiu.ac.bd");
    fill(document.querySelector("#password"), "Password123!");
    button("Sign in").click();
    await wait(() => location.pathname === "/dashboard", "student navigation");
    await navigate("/requisitions");
    await wait(() => document.body.textContent.includes("Outstanding penalties have reached"), "student penalty block");
    if (!button("New Requisition")?.disabled) throw new Error("blocked personal button remained enabled");
    [...document.querySelectorAll('a[href="/penalties"]')].at(-1).click();
    await wait(() => location.pathname === "/penalties" && document.body.textContent.includes("Penalties"), "penalty link keeps session");

    button("Logout").click();
    const headEmail = await wait(() => document.querySelector("#email"), "department head login");
    fill(headEmail, "storehead@uiu.ac.bd");
    fill(document.querySelector("#password"), "Password123!");
    button("Sign in").click();
    await wait(() => location.pathname === "/dashboard", "department head navigation");
    await navigate("/purchase-requests");
    const rung1Row = await wait(() => [...document.querySelectorAll("tr")]
      .find((row) => row.textContent.includes("Rung 1") && row.textContent.includes("Multimeter")), "rung 1 approval row");
    const approve = [...rung1Row.querySelectorAll("button")].find((item) => item.textContent.trim() === "Approve");
    if (!approve) throw new Error("Rung 1 approval button is missing");
    approve.click();
    const remarksDialog = await wait(() => [...document.querySelectorAll('[role="dialog"]')]
      .find((node) => node.textContent.includes("Optional remarks for this approval")), "approval remarks dialog");
    fill(remarksDialog.querySelector("input"), "Endorsed by department");
    [...remarksDialog.querySelectorAll("button")].find((item) => item.textContent.trim() === "Continue").click();
    await wait(() => ![...document.querySelectorAll("tr")].some((row) => row.textContent.includes("Rung 1") && row.textContent.includes("Multimeter")), "rung 1 decision refresh");

    const roleDashboards = [
      ["instructor@uiu.ac.bd", "Plan your assigned classes", "/sessions", "/purchase-requests"],
      ["labasst@uiu.ac.bd", "Prepare assigned labs", "/damage-reports", "/users"],
      ["officeadmin@uiu.ac.bd", "Review final purchase approvals", "/purchase-requests", "/users"],
    ];
    for (const [address, greeting, allowed, forbidden] of roleDashboards) {
      button("Logout").click();
      const roleEmail = await wait(() => document.querySelector("#email"), address + " login");
      fill(roleEmail, address);
      fill(document.querySelector("#password"), "Password123!");
      button("Sign in").click();
      await wait(() => location.pathname === "/dashboard" && document.body.textContent.includes(greeting), address + " dashboard");
      if (!document.querySelector('a[href="' + allowed + '"]')) throw new Error(address + " missing " + allowed);
      if (document.querySelector('a[href="' + forbidden + '"]')) throw new Error(address + " shows " + forbidden);
    }
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
  let purchaseLevel = 1;
  let approvedPurchaseStatus = "APPROVED";
  let stockOnHand = 5;
  let currentRole = "SYSTEM_ADMIN";
  let web;
  const damage = () => ({
    id: "damage-1", componentId: "component-1", requisitionId: "request-1", qty: 1,
    status: damageStatus, notes: null, createdAt: "2026-09-26T00:00:00.000Z",
    component: { id: "component-1", code: "METER", name: "Multimeter" },
    reportedBy: { id: "student-1", fullName: "Student" },
  });
  const suggestion = () => ({
    id: "suggestion-1", type: "SUBSTITUTE", targetRole: "CENTRAL_STORE_OFFICER",
    payload: { componentCode: "METER" }, evidence: { onHand: 1, reorderPoint: 5 },
    status: suggestionStatus, createdAt: "2026-09-26T00:00:00.000Z", feedback: [],
  });
  const component = () => ({
    id: "component-1", code: "METER", name: "Multimeter", category: "Instrument",
    sizeClass: "EXPENSIVE", unitCost: "150.00", unit: "pcs", description: null,
    isReturnable: true, isActive: true, stock: { onHand: stockOnHand, spareQty: 1, reorderPoint: 2 },
  });
  const stock = () => ({ id: "stock-1", componentId: "component-1", onHand: stockOnHand,
    spareQty: 1, reorderPoint: 2, updatedAt: "2026-09-26T00:00:00.000Z", component: component() });
  const approvedPurchase = () => ({
    id: "purchase-approved", requisitionId: null, componentId: "component-1",
    qtyNeeded: 2, urgency: "HIGH", status: approvedPurchaseStatus, currentLevel: 3,
    raisedById: "lab-asst-1", poNumber: approvedPurchaseStatus === "RECEIVED" ? "PO-QA-001" : null,
    receivedQty: approvedPurchaseStatus === "RECEIVED" ? 2 : 0,
    createdAt: "2026-09-26T00:00:00.000Z",
    component: { id: "component-1", code: "METER", name: "Multimeter", unit: "pcs" },
    requisition: null, steps: [],
  });
  const rung2Purchase = () => ({
    id: "purchase-rung-2", requisitionId: null, componentId: "component-1",
    qtyNeeded: 2, urgency: "HIGH", status: "PENDING", currentLevel: purchaseLevel,
    raisedById: "lab-asst-1", poNumber: null, receivedQty: 0,
    createdAt: "2026-09-26T00:00:00.000Z",
    component: { id: "component-1", code: "METER", name: "Multimeter", unit: "pcs" },
    requisition: null,
    steps: [
      { id: "step-1", purchaseRequestId: "purchase-rung-2", level: 1,
        approverRole: "DEPT_STORE_HEAD", approverId: null, decision: "PENDING",
        decidedAt: null, dueAt: "2026-10-03T00:00:00.000Z", remarks: null },
      { id: "step-2", purchaseRequestId: "purchase-rung-2", level: 2,
        approverRole: "CENTRAL_STORE_OFFICER", approverId: null, decision: "PENDING",
        decidedAt: null, dueAt: "2026-10-03T00:00:00.000Z", remarks: null },
    ],
  });
  const departments = () => [
    { id: "cse", code: "CSE", name: "Computer Science", isOffice: false, isActive: true },
    { id: "eee", code: "EEE", name: "Electrical Engineering", isOffice: false, isActive: true },
  ];
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
        currentRole = body.email === "student@uiu.ac.bd" ? "STUDENT"
          : body.email === "storehead@uiu.ac.bd" ? "DEPT_STORE_HEAD"
            : body.email === "central@uiu.ac.bd" ? "CENTRAL_STORE_OFFICER"
              : body.email === "instructor@uiu.ac.bd" ? "INSTRUCTOR"
                : body.email === "labasst@uiu.ac.bd" ? "LAB_ASSISTANT"
                  : body.email === "officeadmin@uiu.ac.bd" ? "OFFICE_ADMIN" : "SYSTEM_ADMIN";
        data = {
          token: "test-token", user: currentRole === "STUDENT"
            ? { id: "student-1", email: "student@uiu.ac.bd", fullName: "Student",
              role: "STUDENT", departmentId: "cse", departmentCode: "CSE" }
            : currentRole === "DEPT_STORE_HEAD"
              ? { id: "head-1", email: "storehead@uiu.ac.bd", fullName: "Department Head",
                role: "DEPT_STORE_HEAD", departmentId: "cse", departmentCode: "CSE" }
            : currentRole === "CENTRAL_STORE_OFFICER"
              ? { id: "central-1", email: "central@uiu.ac.bd", fullName: "Central Officer",
                role: "CENTRAL_STORE_OFFICER", departmentId: null, departmentCode: "OFFICE" }
            : currentRole === "INSTRUCTOR" || currentRole === "LAB_ASSISTANT" || currentRole === "OFFICE_ADMIN"
              ? { id: currentRole.toLowerCase(), email: body.email, fullName: currentRole.replaceAll("_", " "),
                role: currentRole, departmentId: currentRole === "OFFICE_ADMIN" ? null : "cse",
                departmentCode: currentRole === "OFFICE_ADMIN" ? "OFFICE" : "CSE" }
            : { id: "admin-1", email: "sysadmin@uiu.ac.bd", fullName: "System Admin",
              role: "SYSTEM_ADMIN", departmentId: null, departmentCode: null },
        };
      }
      else if (url.pathname === "/api/components") data = { data: [component()], total: 1, page: 1, limit: 20 };
      else if (url.pathname === "/api/departments") data = { data: departments(), total: 2, page: 1, limit: 20 };
      else if (url.pathname === "/api/stocks/transfer") data = { data: {} };
      else if (url.pathname === "/api/stocks") data = { data: [stock()], total: 1, page: 1, limit: 20 };
      else if (url.pathname === "/api/quotas/suggestions") data = { department: departments()[0], peakGroups: 2, from: "2026-09-01", to: "2026-09-30", suggestions: [{ componentId: "component-1", maxQtyPerGroup: 1, suggestedQty: 2 }] };
      else if (url.pathname === "/api/quotas") data = { data: [], total: 0, page: 1, limit: 20 };
      else if (url.pathname === "/api/purchase-requests/aggregate") data = { data: { id: "purchase-1" } };
      else if (url.pathname === "/api/purchase-requests/queue") data = {
        data: currentRole === "DEPT_STORE_HEAD" && purchaseLevel === 1 ? [rung2Purchase()] : [],
      };
      else if (url.pathname === "/api/purchase-requests/purchase-rung-2/decide") {
        purchaseLevel = 3; data = { data: rung2Purchase() };
      }
      else if (url.pathname === "/api/purchase-requests/purchase-approved/receive") {
        stockOnHand += body.qtyReceived;
        approvedPurchaseStatus = "RECEIVED";
        data = { data: approvedPurchase() };
      }
      else if (url.pathname === "/api/purchase-requests" && req.method === "POST") data = { data: { id: "purchase-1" } };
      else if (url.pathname === "/api/purchase-requests") data = {
        data: currentRole === "CENTRAL_STORE_OFFICER" ? [approvedPurchase()] : currentRole === "DEPT_STORE_HEAD" ? [rung2Purchase()] : [],
        total: currentRole === "CENTRAL_STORE_OFFICER" || currentRole === "DEPT_STORE_HEAD" ? 1 : 0, page: 1, limit: 20,
      };
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
      "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--window-size=390,844",
      "--disable-background-networking", `--user-data-dir=${profile}`,
      "--virtual-time-budget=60000", "--dump-dom", `http://127.0.0.1:${webPort}/login`,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    chrome.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const exitCode = await new Promise((done, reject) => {
      const timer = setTimeout(() => { chrome.kill(); reject(new Error("Browser timed out")); }, 120000);
      chrome.once("close", (code) => { clearTimeout(timer); done(code); });
      chrome.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    assert.equal(exitCode, 0, stderr.slice(-1000));
    const browserResult = stdout.match(/<pre id="browser-test-result"[^>]*data-status="(passed|failed)"[^>]*>([\s\S]*?)<\/pre>/);
    assert.equal(browserResult?.[1], "passed", `${browserResult?.[2] ?? stdout.slice(-1500)}\nRecent API: ${JSON.stringify(events.slice(-12))}`);
    assert(events.some((event) => event.method === "PUT" && event.path === "/api/penalty-rates" && event.body.blockThreshold === 50));
    assert.deepEqual(events.filter((event) => event.method === "PATCH" && event.path === "/api/damage-reports/damage-1")
      .map((event) => event.body.status), ["UNDER_MAINTENANCE", "REPAIRED"]);
    assert(events.some((event) => event.method === "PATCH" && event.path === "/api/suggestions/suggestion-1/decision" && event.body.accepted === true));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/requisitions/request-1/issue"));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/requisitions/request-1/return" &&
      event.body.items[0].goodQty === 1 && event.body.items[0].damagedQty === 1));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/stocks/transfer" &&
      event.body.fromDeptId === "cse" && event.body.toDeptId === "eee" && event.body.qty === 1));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/quotas/suggestions" && event.body.departmentId === "cse"));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/purchase-requests" && event.body.qtyRequested === 2));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/purchase-requests/aggregate" && event.body.componentId === "component-1"));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/purchase-requests/purchase-approved/receive" &&
      event.body.poNumber === "PO-QA-001" && event.body.qtyReceived === 2));
    assert(events.some((event) => event.method === "POST" && event.path === "/api/purchase-requests/purchase-rung-2/decide" &&
      event.body.action === "APPROVE" && event.body.remarks === "Endorsed by department"));
  } finally {
    if (web) {
      web.kill();
      if (web.exitCode === null) await new Promise((done) => web.once("exit", done));
    }
    await new Promise((done) => api.close(done));
    await rm(work, { recursive: true, force: true });
  }
});
