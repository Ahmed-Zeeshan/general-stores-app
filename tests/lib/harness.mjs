// Shared helpers for the test suites. Suites run as child processes of tests/run.mjs, which starts
// the app on a test database and a mock FBR server, and restarts / stops the app when asked.
import mongoose from "mongoose";

export const B = process.env.TEST_BASE_URL || "http://localhost:3100";
export const FBR = process.env.TEST_FBR_URL || "http://127.0.0.1:4646";
export const SHOTS = process.env.TEST_SHOTS_DIR || "test-results";

let passed = 0;

/** HTTP client with its own cookie jar (one per logged-in person). */
export class Client {
  constructor(name) {
    this.name = name;
    this.cookies = {};
  }
  get cookie() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  async raw(path, opts = {}, retry = true) {
    const { method, body, headers = {} } = opts;
    let res;
    try {
      res = await fetch(B + path, {
        method: method ?? (body !== undefined ? "POST" : "GET"),
        headers: { "Content-Type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });
    } catch (e) {
      // A kept-alive connection to a server that was just restarted: try once more.
      if (!retry) throw e;
      await new Promise((r) => setTimeout(r, 500));
      return this.raw(path, opts, false);
    }
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.cookies[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return res;
  }
  async call(path, { expect = 200, ...opts } = {}) {
    const res = await this.raw(path, opts);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    // `expect` may be one status or a list of allowed ones.
    if (Array.isArray(expect) ? !expect.includes(res.status) : res.status !== expect) {
      const m = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
      throw new Error(`[${this.name}] ${m} ${path} -> ${res.status} (expected ${expect}) ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data)}`);
    }
    return data;
  }
  login(username, password, expect = 200) {
    return this.call("/api/auth/login", { body: { username, password }, expect });
  }
}

export const ok = (cond, msg) => {
  if (!cond) throw new Error("FAILED: " + msg);
  passed++;
  console.log("  ✓", msg);
};
const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.006;
export const eq = (a, b, msg) => ok(a === b || near(a, b), `${msg} (${JSON.stringify(a)}${a === b || near(a, b) ? "" : ` expected ${JSON.stringify(b)}`})`);
/** Text read from the page with non-breaking spaces (used inside amounts) turned into plain spaces. */
export const norm = (t) => String(t).replace(/\u00a0/g, " ");
export const section = (t) => console.log(`\n== ${t}`);
export const r2 = (n) => Math.round(n * 100) / 100;
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
export const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + n * 864e5));

/** Direct database access for tests that simulate old data (same test database as the app). */
export async function db() {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGODB_URI);
  return mongoose.connection.db;
}
export const oid = (id) => new mongoose.Types.ObjectId(String(id));

function ask(type) {
  if (!process.send) throw new Error("Run the suites with: npm test");
  return new Promise((resolve) => {
    const onMsg = (m) => {
      if (m?.type === `${type}:done`) {
        process.off("message", onMsg);
        resolve();
      }
    };
    process.on("message", onMsg);
    process.send({ type });
  });
}
/** Restart the app (clears in-memory caches such as login lockouts and branch setup). */
export const restartServer = () => ask("restart");
export const stopServer = () => ask("stop");
export const startServer = () => ask("start");

export async function done() {
  console.log(`\nALL ${passed} CHECKS PASSED`);
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

// ---------- browser suites ----------
export async function launchBrowser(options = {}) {
  const { chromium } = await import("playwright");
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, ...options });
}

/** Browser-suite check: records a failure but keeps going so one run shows every problem. */
export const check = (cond, msg) => {
  if (!cond) {
    console.log("  ✗", msg);
    process.exitCode = 1;
  } else {
    passed++;
    console.log("  ✓", msg);
  }
};
export function finishUi() {
  console.log(process.exitCode ? "\nSOME CHECKS FAILED" : `\nALL ${passed} CHECKS PASSED`);
}
