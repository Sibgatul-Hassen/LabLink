const assert = require("node:assert/strict");
const { Module } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const esbuild = require("esbuild");

const source = [
  'export { apiClient } from "./src/api/client";',
  'export { useAuthStore } from "./src/store/authStore";',
  'export { orderLiveForSession, cancelRequisition } from "./src/api/requisition.api";',
  'export { updateDamageReport } from "./src/api/damage.api";',
  'export { payPenalty } from "./src/api/penalty.api";',
].join("\n");

const built = esbuild.buildSync({
  stdin: {
    contents: source,
    resolveDir: path.resolve(__dirname, ".."),
    sourcefile: "api-contract-entry.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false,
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://lablink.test") },
});
const compiled = new Module(path.join(__dirname, "compiled-api-contract.cjs"));
compiled.filename = path.join(__dirname, "compiled-api-contract.cjs");
compiled.paths = module.paths;
compiled._compile(built.outputFiles[0].text, compiled.filename);
const api = compiled.exports;

const requests = [];
api.apiClient.defaults.adapter = async (config) => {
  requests.push(config);
  return { data: { data: { id: "result" } }, status: 200, statusText: "OK", headers: {}, config };
};

test("live ordering sends exact class quantities with the bearer token", async () => {
  requests.length = 0;
  api.useAuthStore.setState({ token: "test-token" });
  await api.orderLiveForSession("session-1", [{ componentId: "component-1", qtyNeeded: 3 }]);
  assert.equal(requests[0].method, "post");
  assert.equal(requests[0].url, "/api/sessions/session-1/live-order");
  assert.equal(requests[0].headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(requests[0].data), {
    lines: [{ componentId: "component-1", qtyNeeded: 3 }],
  });
});

test("cancellation, damage review, and penalty payment target their API routes", async () => {
  requests.length = 0;
  await api.cancelRequisition("req-1");
  await api.updateDamageReport("damage-1", "REPAIRED", "Connector replaced");
  await api.payPenalty("penalty-1", "RECEIPT-1");
  assert.deepEqual(requests.map((request) => [request.method, request.url]), [
    ["post", "/api/requisitions/req-1/cancel"],
    ["patch", "/api/damage-reports/damage-1"],
    ["post", "/api/penalties/penalty-1/pay"],
  ]);
  assert.deepEqual(JSON.parse(requests[1].data), { status: "REPAIRED", notes: "Connector replaced" });
  assert.deepEqual(JSON.parse(requests[2].data), { receiptRef: "RECEIPT-1" });
});
