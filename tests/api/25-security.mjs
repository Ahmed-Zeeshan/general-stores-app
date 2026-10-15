import { createJiti } from "jiti";
import { B, Client, ok, eq, section, restartServer, done } from "../lib/harness.mjs";

// ---------- Security: logins, sessions, other websites, branches, cost prices, restore, headers ----------
const admin = new Client("admin"), owner = new Client("owner"), other = new Client("other");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Safe Store", shopType: "general", maxUsers: 5, maxBranches: 2, ownerName: "Bilal", username: "bilal", password: "secret1" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 3, ownerName: "Omar", username: "omar", password: "secret3" } });
await owner.login("bilal", "secret1");
await other.login("omar", "secret3");

section("First-run setup");
await new Client("late").call("/api/setup", { body: { name: "Intruder", username: "intruder", password: "intruder-123" }, expect: 400 }).then((e) => ok(/already done/.test(e.error), "setup cannot be run again once the admin exists"));

section("Signing secret");
const session = await createJiti(import.meta.url).import("../../src/lib/session.ts");
const withSecret = (s) => {
  const old = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = s;
  try {
    session.authSecret();
    return true;
  } catch {
    return false;
  } finally {
    process.env.AUTH_SECRET = old;
  }
};
ok(!withSecret("change-me-to-a-long-random-string"), "the example secret from .env.example is refused");
ok(!withSecret("short-secret-1234"), "a short secret is refused");
ok(!withSecret(""), "a missing secret is refused");
ok(withSecret("q8R2v0yXkP1nL7sT4bW9zC3mF6hJ5dA0"), "a long random secret is accepted");

section("Wrong passwords");
const brute = new Client("brute");
// Each try claims to come from a different address: the lock is per account, so it does not help.
for (let i = 0; i < 10; i++) await brute.call("/api/auth/login", { body: { username: "omar", password: `guess${i}` }, headers: { "X-Forwarded-For": `10.0.0.${i}` }, expect: 401 });
await brute.call("/api/auth/login", { body: { username: "omar", password: "secret3" }, headers: { "X-Forwarded-For": "10.9.9.9" }, expect: 429 }).then((e) => ok(/Too many wrong attempts/.test(e.error), "10 wrong passwords lock the account even when the address changes each time"));
await restartServer();
await brute.call("/api/auth/login", { body: { username: "omar", password: "secret3" }, expect: 429 }).then(() => ok(true, "the lock survives restarting the app (kept in the database)"));
const nobody = await brute.call("/api/auth/login", { body: { username: "no-such-user", password: "whatever" }, expect: 401 });
eq(nobody.error, "Wrong username or password.", "unknown username gets the same answer as a wrong password");
await other.call("/api/auth/me").then(() => ok(true, "the locked owner's existing login keeps working"));

section("Password change ends other logins");
const kashif = await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
const pc1 = new Client("pc1"), pc2 = new Client("pc2");
await pc1.login("kashif", "secret2");
await pc2.login("kashif", "secret2");
await pc1.call("/api/auth/password", { body: { currentPassword: "secret2", newPassword: "secret22" } });
await pc1.call("/api/auth/me").then(() => ok(true, "the computer that changed the password stays logged in"));
await pc2.call("/api/auth/me", { expect: 401 }).then(() => ok(true, "the other computer's login with the old password has ended"));
await pc2.login("kashif", "secret22");
await owner.call(`/api/users/${kashif._id}`, { method: "PUT", body: { password: "secret33" } });
await pc2.call("/api/auth/me", { expect: 401 }).then(() => ok(true, "owner resets the password: the staff member's logins end"));
await pc1.call("/api/auth/me", { expect: 401 });
const cashier = new Client("cashier");
await cashier.login("kashif", "secret33");

section("Requests from other websites");
const evil = await owner.raw("/api/expenses", { body: { category: "Other", amount: 999 }, headers: { Origin: "https://evil.example" } });
eq(evil.status, 403, "a change sent from another website is refused");
const own = await owner.raw("/api/expenses", { body: { category: "Other", amount: 10 }, headers: { Origin: B } });
eq(own.status, 200, "the same change from the app's own page works");
const nul = await owner.raw("/api/expenses", { body: { category: "Other", amount: 999 }, headers: { Origin: "null" } });
eq(nul.status, 403, "a sandboxed page (Origin: null) is refused");
const read = await owner.raw("/api/dashboard", { headers: { Origin: "https://evil.example" } });
eq(read.status, 200, "reading is not affected (the login cookie is not sent cross-site anyway)");
const bad = await owner.raw("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" } });
eq(bad.status, 400, "a body that is not JSON gets a clear 400, not a crash");

section("Headers");
const page = await fetch(B + "/login");
const csp = page.headers.get("content-security-policy") ?? "";
ok(csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'self'") && csp.includes("base-uri 'self'") && !csp.includes("unsafe-eval"), "Content-Security-Policy on pages (no eval in production)");
ok(page.headers.get("x-frame-options") === "SAMEORIGIN" && page.headers.get("x-content-type-options") === "nosniff", "framing and type sniffing blocked");
ok(!!page.headers.get("cross-origin-opener-policy"), "Cross-Origin-Opener-Policy set");
eq((await owner.raw("/api/dashboard")).headers.get("cache-control"), "no-store", "shop data is never cached by the browser");
eq((await owner.raw("/api/products", { headers: {} })).headers.get("x-powered-by"), null, "no server banner");

section("Branches");
const soap = await owner.call("/api/products", { body: { name: "Lux Soap", unit: "pcs", costPrice: 80, salePrice: 100, lowStockAlert: 0, openingStock: 50 } });
const b2 = await owner.call("/api/branches", { body: { name: "Second Branch" } });
const main = (await owner.call("/api/branches")).branches.find((b) => b.isMain);
await owner.call("/api/transfers", { body: { toBranch: b2._id, items: [{ productId: soap._id, qty: 10 }] } });
const bill2 = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1 }], paymentMethod: "cash", branchId: b2._id } });
const bill1 = await owner.call("/api/sales", { body: { items: [{ productId: soap._id, qty: 1 }], paymentMethod: "cash" } });
const sana = await owner.call("/api/users", { body: { name: "Sana", username: "sana", password: "secret4", role: "manager" } });
await owner.call(`/api/users/${sana._id}`, { method: "PUT", body: { branch: main._id } });
const mgr = new Client("mgr");
await mgr.login("sana", "secret4");
await mgr.call(`/api/sales/${bill2._id}`, { expect: 404 }).then(() => ok(true, "manager locked to the main branch cannot open a bill of the other branch"));
await mgr.call(`/api/sales/${bill2._id}/return`, { body: { items: [] }, expect: 404 }).then(() => ok(true, "…or return it"));
ok((await mgr.call(`/api/sales/${bill1._id}`)).invoiceNo === bill1.invoiceNo, "but works on bills of her own branch");
ok((await owner.call(`/api/sales/${bill2._id}`)).invoiceNo === bill2.invoiceNo, "the owner sees every branch");
await other.call(`/api/sales/${bill1._id}`, { expect: 404 }).then(() => ok(true, "another shop cannot open this shop's bill"));

section("Cost prices and profit stay with the owner");
const cp = await cashier.call("/api/products");
ok(cp.length && cp.every((p) => p.costPrice === undefined), "cashier: product list has no cost prices");
ok((await owner.call("/api/products"))[0].costPrice === 80, "owner still sees them");
const cs = await cashier.call(`/api/sales/${bill1._id}`);
ok(cs.costTotal === undefined && cs.items.every((i) => i.cost === undefined), "cashier: bills have no cost");
ok((await cashier.call("/api/sales")).every((s) => s.costTotal === undefined), "cashier: bill list has no cost");
const dash = await cashier.call("/api/dashboard");
ok(dash.today.profit === 0 && dash.series.every((d) => d.profit === 0) && dash.today.sales > 0, "cashier: dashboard shows sales but no profit");
ok((await owner.call("/api/dashboard")).today.profit > 0, "owner: profit shown");

section("Restore checks the whole file first");
const backup = await owner.call("/api/backup");
const restore = (b) => owner.call("/api/restore", { body: { backup: b, confirm: "Safe Store" }, expect: 400 });
const twice = structuredClone(backup);
twice.data.products.push(twice.data.products[0]);
await restore(twice).then((e) => ok(/same record twice/.test(e.error), "the same record twice is refused: " + e.error));
const otherBackup = await other.call("/api/backup");
const otherSoap = await other.call("/api/products", { body: { name: "Other soap", unit: "pcs", costPrice: 1, salePrice: 2, lowStockAlert: 0 } });
const foreign = structuredClone(backup);
foreign.data.products.push({ ...foreign.data.products[0], _id: otherSoap._id, name: "Stolen" });
await restore(foreign).then((e) => ok(/another shop/.test(e.error), "a record that belongs to another shop is refused"));
const many = structuredClone(backup);
for (let i = 0; i < 3; i++) many.data.branches.push({ ...many.data.branches[0], _id: undefined, name: `Extra ${i}`, isMain: false });
many.data.branches.forEach((b, i) => !b._id && (b._id = `65f0000000000000000000${10 + i}`));
await restore(many).then((e) => ok(/plan allows 2/.test(e.error), "more branches than the plan allows is refused"));
ok((await owner.call("/api/products")).some((p) => p.name === "Lux Soap"), "nothing was deleted by the refused restores");
ok(backup.shop.adminNotes === undefined && otherBackup.shop.adminNotes === undefined, "the administrator's private notes are not in the shop's backup");

await done();
