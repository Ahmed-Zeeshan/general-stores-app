import { Client, ok, section, done } from "../lib/harness.mjs";

// ---------- Bills, repair slips and installment plans on WhatsApp: signed customer links ----------
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + n * 864e5));
const admin = new Client("admin"), owner = new Client("owner"), cashier = new Client("cashier"), other = new Client("other"), anon = new Client("customer");
await admin.call("/api/setup", { body: { name: "Admin", username: "admin", password: "admin-pass-123" } });
const shop = await admin.call("/api/admin/tenants", { body: { shopName: "Ali Mobiles", shopType: "mobile", maxUsers: 3, ownerName: "Ali", username: "ali", password: "secret1", phone: "0300-5556667" } });
await admin.call("/api/admin/tenants", { body: { shopName: "Other Shop", shopType: "general", maxUsers: 3, ownerName: "Omar", username: "omar", password: "secret3" } });
await owner.login("ali", "secret1");
await other.login("omar", "secret3");
await owner.call("/api/users", { body: { name: "Kashif", username: "kashif", password: "secret2", role: "cashier" } });
await cashier.login("kashif", "secret2");
const base = { shopName: "Ali Mobiles", shopType: "mobile", taxEnabled: false, taxRate: 0, pricesIncludeTax: true, phone: "0300-5556667", address: "Hall Road, Lahore" };

const cust = await owner.call("/api/parties", { body: { type: "customer", name: "Shahid", phone: "0321-1234567" } });
const glass = await owner.call("/api/products", { body: { name: "Tempered Glass", unit: "pcs", costPrice: 80, salePrice: 300, lowStockAlert: 0, openingStock: 10 } });
const sale = await cashier.call("/api/sales", { body: { items: [{ productId: glass._id, qty: 2 }], paymentMethod: "cash", amountPaid: 500, customerId: cust._id, paymentMethod: "credit" } });

section("Without a public address");
let sh = await cashier.call(`/api/share?kind=sale&id=${sale._id}`);
ok(sh.url === null && sh.phone === "0321-1234567", "no link yet (app not on the internet); the customer's mobile is filled in");
await other.call(`/api/share?kind=sale&id=${sale._id}`, { expect: 404 }).then(() => ok(true, "another shop cannot make a link for this bill"));

section("With the app's address set");
await owner.call("/api/settings", { method: "PUT", body: { ...base, publicUrl: "myshop" }, expect: 400 }).then((e) => ok(/https/.test(e.error), "the address must start with https://"));
await owner.call("/api/settings", { method: "PUT", body: { ...base, publicUrl: "https://alimobiles.example.com/" } });
sh = await cashier.call(`/api/share?kind=sale&id=${sale._id}`);
ok(sh.url.startsWith("https://alimobiles.example.com/r/s-"), "bill link: https://alimobiles.example.com/r/s-…");
const code = sh.url.split("/r/")[1];

let pub = await anon.call(`/api/public/${code}`);
ok(pub.kind === "sale" && pub.shop.name === "Ali Mobiles" && pub.shop.address === "Hall Road, Lahore" && pub.data.invoiceNo === sale.invoiceNo, "anyone with the link sees the bill and the shop (no login)");
ok(pub.data.total === 600 && pub.data.paid === 500 && pub.data.creditAmount === 100 && pub.data.items[0].name === "Tempered Glass", "bill: Rs 600, Rs 500 paid, Rs 100 on khata");
ok(!JSON.stringify(pub).includes("costTotal") && pub.data.items.every((i) => i.cost === undefined) && pub.data.cashierName === undefined, "no cost, profit or staff names in the customer's copy");

section("Links cannot be guessed or changed");
await anon.call(`/api/public/${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`, { expect: 404 }).then(() => ok(true, "changed signature: not valid"));
const parts = code.split("-");
const otherSale = await cashier.call("/api/sales", { body: { items: [{ productId: glass._id, qty: 1 }], paymentMethod: "cash" } });
await anon.call(`/api/public/${parts[0]}-${parts[1]}-${otherSale._id}-${parts[3]}`, { expect: 404 }).then(() => ok(true, "another bill with this signature: not valid"));
await anon.call(`/api/public/r-${parts[1]}-${parts[2]}-${parts[3]}`, { expect: 404 }).then(() => ok(true, "same id as a repair: not valid"));
await anon.call("/api/public/hello", { expect: 404 }).then(() => ok(true, "random text: not valid"));

section("Repair slips and installment plans");
const job = await cashier.call("/api/repairs", { body: { customerName: "Nadeem", customerPhone: "0333-7654321", deviceName: "Redmi Note 12", problem: "Screen", lockCode: "4321", estimate: 6000, promisedAt: day(2), advance: 1000, advanceMethod: "cash" } });
sh = await cashier.call(`/api/share?kind=repair&id=${job._id}`);
ok(sh.phone === "0333-7654321" && sh.url.includes("/r/r-"), "repair link and the customer's mobile");
pub = await anon.call(`/api/public/${sh.url.split("/r/")[1]}`);
ok(pub.kind === "repair" && pub.data.status === "received" && pub.data.paid === 1000 && pub.data.deviceName === "Redmi Note 12", "repair: status, phone and advance");
ok(!JSON.stringify(pub).includes("4321") && pub.data.parts.every((p) => p.cost === undefined), "no screen-lock code or part costs");

const phone = await owner.call("/api/products", { body: { name: "Vivo Y28", unit: "pcs", costPrice: 38000, salePrice: 45000, lowStockAlert: 0, trackSerial: true } });
const [dev] = await owner.call("/api/devices", { body: { productId: phone._id, cost: 38000, units: [{ imei: "356938035643809" }] } });
const plan = (await cashier.call("/api/installments", { body: { sale: { items: [{ productId: phone._id, qty: 1, serials: [dev._id] }], paymentMethod: "cash", amountPaid: 15000, customerId: cust._id }, plan: { months: 6, markupType: "percent", markupValue: 10, firstDue: day(30), customerCnic: "3410112345673" } } })).plan;
sh = await cashier.call(`/api/share?kind=installment&id=${plan._id}`);
pub = await anon.call(`/api/public/${sh.url.split("/r/")[1]}`);
ok(pub.kind === "installment" && pub.data.rows.length === 6 && pub.data.balance === 33000 && pub.data.customerCnic === undefined, "installment plan: 6 months, Rs 33,000 left, no CNIC shown");

section("Suspended shop");
await admin.call(`/api/admin/tenants/${shop._id}`, { method: "PUT", body: { status: "suspended" } });
await anon.call(`/api/public/${code}`, { expect: 404 }).then(() => ok(true, "links of a suspended shop stop working"));
await done();
