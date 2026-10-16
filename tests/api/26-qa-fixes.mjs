import { Client, ok, eq, section, done } from "../lib/harness.mjs";

// ---------- QA fixes: customer totals, phone numbers, drawer status, login details ----------
const admin = new Client("admin"), owner = new Client("owner");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Ashraf Store", shopType: "general", maxUsers: 3, ownerName: "Ashraf", username: "ashraf", password: "secret1" } });
const login = await owner.login("ashraf", "secret1");

section("Login brings the app's details");
ok(login.me?.user?.name === "Ashraf" && login.me.settings?.shopName === "Ashraf Store" && login.me.branch?.name, "login answer has the user, shop settings and branch (no second request needed)");
const me = await owner.call("/api/auth/me");
eq(JSON.stringify(Object.keys(login.me).sort()), JSON.stringify(Object.keys(me).sort()), "same details as /api/auth/me");

section("Phone numbers");
const add = (name, phone, type = "customer", expect = 200) => owner.call("/api/parties", { body: { type, name, phone }, expect });
eq((await add("A", "03491234567")).phone, "0349-1234567", "03XXXXXXXXX saved as 0349-1234567");
eq((await add("B", "+92 300 7654321")).phone, "0300-7654321", "+92 format normalized");
eq((await add("C", "923211112223")).phone, "0321-1112223", "92… without + normalized");
eq((await add("D", "0300-555 6667")).phone, "0300-5556667", "dashes and spaces tidied");
ok((await add("E", "")).phone === undefined, "no phone is fine");
await add("Bad", "abc123", "customer", 400).then((e) => ok(/Pakistani mobile/.test(e.error), "abc123 refused: " + e.error));
await add("Short", "0300-12345", "customer", 400).then(() => ok(true, "too short refused"));
await add("Landline", "042-35123456", "customer", 400).then(() => ok(true, "customers need a mobile (WhatsApp)"));
eq((await add("Mill", "042-35123456", "supplier")).phone, "042-35123456", "a supplier may have a landline");
const a = (await owner.call("/api/parties?type=customer")).find((p) => p.name === "A");
await owner.call(`/api/parties/${a._id}`, { method: "PUT", body: { name: "A", phone: "xyz" }, expect: 400 }).then(() => ok(true, "editing to a bad number is refused too"));
eq((await owner.call(`/api/parties/${a._id}`, { method: "PUT", body: { name: "A", phone: "+923491112223" } })).phone, "0349-1112223", "editing normalizes");

section("Search by phone, with or without dashes");
const hits = (q) => owner.call(`/api/parties?type=customer&q=${encodeURIComponent(q)}`).then((l) => l.map((p) => p.name));
ok((await hits("0300765")).includes("B"), "03007654321 found by 0300765");
ok((await hits("0300-765")).includes("B"), "…and by 0300-765");
ok((await hits("0349")).length === 1, "0349 finds one customer");

section("Customer totals ignore the search");
await owner.call("/api/parties", { body: { type: "customer", name: "Udhaar Wala", phone: "03001110000", openingBalance: 750 } });
const s = await owner.call("/api/parties?type=customer&summary=1");
eq(s.count, 6, "6 customers in the shop");
eq(s.dueCount, 1, "1 owes money");
eq(s.dueTotal, 750, "Rs 750 to collect");
eq((await hits("zzzz")).length, 0, "a search for zzzz finds nothing…");
eq((await owner.call("/api/parties?type=customer&summary=1")).count, 6, "…but the totals are the same");

section("Cash drawer: one answer everywhere");
const status = () => owner.call("/api/setup-status").then((r) => r.done.drawer);
const current = () => owner.call("/api/shifts/current").then((r) => !!r.shift);
ok((await status()) === false && (await current()) === false, "no drawer open: checklist and bill screen agree (not open)");
const shift = await owner.call("/api/shifts", { body: { openingCash: 1000 } });
ok((await status()) === true && (await current()) === true, "drawer opened: both say open");
await owner.call(`/api/shifts/${shift._id}/close`, { body: { countedCash: 1000 } });
ok((await status()) === false && (await current()) === false, "drawer closed: both say closed (the checklist no longer counts an old drawer)");

await done();
