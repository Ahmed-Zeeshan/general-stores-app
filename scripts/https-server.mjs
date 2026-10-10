// Runs the built app over HTTPS on the shop network (npm run start:https).
// Phones and tablets only allow the camera barcode scanner on https:// addresses, so this lets
// counters and mobiles use http://… or https://… of the shop computer.
// A self-signed certificate for this computer's name and network addresses is created in ./certs
// on first start (and again whenever the network address changes).
import { createServer as createHttps } from "node:https";
import { createServer as createHttp } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import { join } from "node:path";
import selfsigned from "selfsigned";

// Same as "next start" (works the same on Windows, where VAR=value in npm scripts does not).
process.env.NODE_ENV = "production";
const { default: next } = await import("next");

const httpsPort = Number(process.env.HTTPS_PORT || 3443);
const httpPort = Number(process.env.PORT || 3000);
const certDir = process.env.CERT_DIR || "certs";
const keyFile = join(certDir, "dukaan.key");
const certFile = join(certDir, "dukaan.crt");
const metaFile = join(certDir, "dukaan.json");

const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a.address);
const names = ["localhost", hostname()];
const ips = ["127.0.0.1", ...lanIps];

async function ensureCertificate() {
  if (process.env.HTTPS_KEY && process.env.HTTPS_CERT) {
    return { key: readFileSync(process.env.HTTPS_KEY), cert: readFileSync(process.env.HTTPS_CERT), own: true };
  }
  const wanted = JSON.stringify({ names, ips });
  if (existsSync(keyFile) && existsSync(certFile) && existsSync(metaFile) && readFileSync(metaFile, "utf8") === wanted) {
    return { key: readFileSync(keyFile), cert: readFileSync(certFile), own: false };
  }
  mkdirSync(certDir, { recursive: true });
  const notBefore = new Date();
  const notAfter = new Date(notBefore);
  notAfter.setFullYear(notAfter.getFullYear() + 2);
  const pems = await selfsigned.generate([{ name: "commonName", value: hostname() }, { name: "organizationName", value: "Dukaan Manager" }], {
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate: notBefore,
    notAfterDate: notAfter,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [...names.map((value) => ({ type: 2, value })), ...ips.map((ip) => ({ type: 7, ip }))] },
    ],
  });
  writeFileSync(keyFile, pems.private, { mode: 0o600 });
  writeFileSync(certFile, pems.cert);
  writeFileSync(metaFile, wanted);
  console.log(`Created a certificate for ${[...names, ...ips].join(", ")} in ${certDir}/`);
  return { key: pems.private, cert: pems.cert, own: false };
}

const { key, cert, own } = await ensureCertificate();
const app = next({ dev: false, dir: process.cwd() });
await app.prepare();
const handle = app.getRequestHandler();

createHttps({ key, cert }, (req, res) => {
  req.headers["x-forwarded-proto"] = "https";
  handle(req, res);
}).listen(httpsPort, "0.0.0.0", () => {
  console.log(`\nDukaan Manager is running over HTTPS:`);
  for (const ip of ["localhost", ...lanIps]) console.log(`  https://${ip}:${httpsPort}`);
  if (!own) console.log(`\nFirst time on each device: the browser warns "Not private" — choose Advanced → Proceed (it is this shop's own certificate).`);
});

// Plain http stays available for computers that already use it.
if (process.env.HTTP !== "off") {
  createHttp((req, res) => handle(req, res)).listen(httpPort, "0.0.0.0", () => {
    console.log(`Also on http://localhost:${httpPort}${lanIps.map((ip) => ` and http://${ip}:${httpPort}`).join("")}`);
  });
}
