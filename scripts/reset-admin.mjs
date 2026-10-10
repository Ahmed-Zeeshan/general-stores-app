/**
 * Create or reset the Super Admin login.
 *
 *   npm run reset-admin                                  -> new random password for the Super Admin
 *   npm run reset-admin -- --username admin --password "MyStrongPass1"
 *
 * Reads MONGODB_URI from .env.local. Shop data is not touched.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Create .env.local first (copy .env.example).");
  process.exit(1);
}

const wantedUsername = arg("username")?.trim().toLowerCase();
if (wantedUsername && !/^[a-z0-9._-]{3,30}$/.test(wantedUsername)) {
  console.error("Username must be 3-30 small letters or numbers (no spaces).");
  process.exit(1);
}
const password = arg("password") ?? crypto.randomBytes(9).toString("base64url");
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 }).catch((err) => {
  console.error(`Cannot connect to MongoDB at ${uri}\nIs MongoDB running? (${err.message})`);
  process.exit(1);
});
const users = mongoose.connection.collection("users");
const passwordHash = await bcrypt.hash(password, 10);

let admin = await users.findOne({ role: "superadmin" });
const username = wantedUsername ?? admin?.username ?? "admin";
const taken = await users.findOne({ username, ...(admin ? { _id: { $ne: admin._id } } : {}) });
if (taken) {
  console.error(`The username "${username}" is already used by a shop user. Choose another with --username.`);
  process.exit(1);
}

if (admin) {
  await users.updateOne({ _id: admin._id }, { $set: { username, passwordHash, active: true, updatedAt: new Date() } });
  console.log("\nSuper Admin password has been reset.");
} else {
  await users.insertOne({
    name: "Super Admin",
    username,
    passwordHash,
    role: "superadmin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("\nSuper Admin account created.");
}
console.log(`
  Login page : http://localhost:3000/login
  Username   : ${username}
  Password   : ${password}

Change this password after logging in (sidebar -> Change password).
If you tried many wrong passwords, restart the app (npm run dev) to clear the 15-minute lock.
`);
await mongoose.disconnect();
