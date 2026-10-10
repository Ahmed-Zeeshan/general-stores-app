// Creates admin, one shop (owner "ahmed"/"secret1") and two products. Prints JSON ids.
import { B } from "./harness.mjs";
const jar = {};
async function call(who, path, body, method) {
  const res = await fetch(B + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(jar[who] ? { cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get("set-cookie"); if (sc) jar[who] = sc.split(";")[0];
  const data = await res.json(); if (!res.ok) throw new Error(path + " " + JSON.stringify(data)); return data;
}
await call("a", "/api/setup", { name: "Admin", username: "admin", password: "admin-pass-123" });
const shop = await call("a", "/api/admin/tenants", { shopName: "Madina Karyana", shopType: "karyana", maxUsers: 3, maxBranches: 2, ownerName: "Ahmed", username: "ahmed", password: "secret1" });
await call("o", "/api/auth/login", { username: "ahmed", password: "secret1" });
const sugar = await call("o", "/api/products", { name: "Sugar", unit: "kg", costPrice: 140, salePrice: 160, lowStockAlert: 5, openingStock: 50 });
const milk = await call("o", "/api/products", { name: "Olpers 1L", unit: "pcs", barcode: "8961014000123", costPrice: 280, salePrice: 300, lowStockAlert: 5, openingStock: 10 });
const cust = await call("o", "/api/parties", { type: "customer", name: "Bilal", phone: "03001234567" });
console.log(JSON.stringify({ shop: shop._id, sugar: sugar._id, milk: milk._id, cust: cust._id }));
