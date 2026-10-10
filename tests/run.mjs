// Runs the test suites against a production build on a separate test database.
//
//   npm test              all suites
//   npm run test:api      API suites only
//   npm run test:ui       browser suites only (Playwright + Chromium)
//   node tests/run.mjs 03 offline    suites whose file name contains "03" or "offline"
//
// Needs MongoDB (TEST_MONGODB_URI, default mongodb://127.0.0.1:27017/dukaan_test — this database
// is wiped before every suite, never point it at real data) and `npm run build` (done if missing).
import { spawn, fork, execSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { startFbrMock } from "./lib/fbr-mock.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEST_PORT || 3100);
const FBR_PORT = Number(process.env.TEST_FBR_PORT || 4646);
const MONGODB_URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/dukaan_test";
if (!/test/i.test(new URL(MONGODB_URI).pathname)) {
  console.error(`Refusing to run: the test database name must contain "test" (got ${MONGODB_URI}). It is wiped before every suite.`);
  process.exit(1);
}
const BASE = `http://localhost:${PORT}`;
const SHOTS = join(root, "test-results");
mkdirSync(SHOTS, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: "production",
  TZ: "Asia/Karachi",
  MONGODB_URI,
  AUTH_SECRET: process.env.AUTH_SECRET || "test-secret-for-automated-tests-only-0123456789",
  FBR_SANDBOX_URL: `http://127.0.0.1:${FBR_PORT}/PostData`,
  AUTO_BACKUP: "off",
  BACKUP_DIR: join(SHOTS, "backups"),
  NEXT_TELEMETRY_DISABLED: "1",
  TEST_BASE_URL: BASE,
  TEST_FBR_URL: `http://127.0.0.1:${FBR_PORT}`,
  TEST_SHOTS_DIR: SHOTS,
};

// UI suites that build on data made by another suite or by the basic seed.
const SETUP = {
  "ui/offline.mjs": { seed: "tests/lib/seed-basic.mjs" },
  "ui/scanning.mjs": { after: "api/02-branches-barcodes.mjs" },
  "ui/activity.mjs": { after: "api/10-activity-log.mjs" },
  "ui/confirm-dialogs.mjs": { after: "api/01-core.mjs" },
};

const args = process.argv.slice(2);
const kinds = args.filter((a) => a === "api" || a === "ui");
const names = args.filter((a) => a !== "api" && a !== "ui");
const list = ["api", "ui"]
  .filter((k) => !kinds.length || kinds.includes(k))
  .flatMap((k) => readdirSync(join(root, "tests", k)).filter((f) => f.endsWith(".mjs")).sort().map((f) => `${k}/${f}`))
  .filter((f) => !names.length || names.some((n) => f.includes(n)));

if (!existsSync(join(root, ".next", "BUILD_ID"))) {
  console.log("No production build yet — running npm run build …");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}

let server = null;
async function startServer() {
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.env.TEST_VERBOSE && process.stderr.write(d));
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/setup`);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("The app did not start. Is MongoDB running?");
}
async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise((resolve) => {
    s.once("exit", resolve);
    s.kill("SIGTERM");
    setTimeout(() => s.kill("SIGKILL"), 5000);
  });
}
async function resetDatabase() {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);
  await mongoose.connection.db.dropDatabase();
}

function runFile(file, extraArgs = []) {
  return new Promise((resolve) => {
    let out = "";
    const child = fork(join(root, file), [SHOTS, ...extraArgs], { cwd: root, env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.stdout.on("data", (d) => ((out += d), process.stdout.write(d)));
    child.stderr.on("data", (d) => ((out += d), process.stderr.write(d)));
    child.on("message", async (m) => {
      if (m?.type === "restart") await stopServer().then(startServer);
      else if (m?.type === "stop") await stopServer();
      else if (m?.type === "start") await startServer();
      child.send({ type: `${m.type}:done` });
    });
    child.on("exit", (code) => resolve({ code, out }));
  });
}

const fbr = await startFbrMock(FBR_PORT);
const results = [];
for (const file of list) {
  console.log(`\n━━━━━━━━ ${file}`);
  await stopServer();
  await resetDatabase();
  await startServer();
  await fetch(`${env.TEST_FBR_URL}/control/reset`).catch(() => {});
  const setup = SETUP[file];
  if (setup?.seed) await runFile(setup.seed);
  if (setup?.after) {
    const pre = await runFile(`tests/${setup.after}`);
    if (pre.code) {
      results.push({ file, ok: false, note: `setup ${setup.after} failed` });
      continue;
    }
    await stopServer();
    await startServer();
  }
  const { code, out } = await runFile(`tests/${file}`);
  const passed = (out.match(/^\s*✓/gm) ?? []).length;
  const failedChecks = (out.match(/^\s*✗/gm) ?? []).length;
  results.push({ file, ok: code === 0, note: code === 0 ? `${passed} checks` : failedChecks ? `${failedChecks} of ${passed + failedChecks} checks failed` : "failed" });
}
await stopServer();
fbr.close();
await mongoose.disconnect();

console.log("\n━━━━━━━━ Summary");
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.file.padEnd(40)} ${r.note}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} suite(s) failed` : `\nAll ${results.length} suites passed`);
process.exit(failed ? 1 : 0);
