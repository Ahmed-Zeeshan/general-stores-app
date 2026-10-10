// A stand-in for FBR's PostData API. /control/fail and /control/ok switch it down / up,
// /control/received lists what was posted.
import http from "node:http";

export function startFbrMock(port) {
  let fail = false;
  let n = 0;
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/control/fail") return (fail = true), res.end("{}");
      if (req.url === "/control/ok") return (fail = false), res.end("{}");
      if (req.url === "/control/reset") return (fail = false), (received.length = 0), res.end("{}");
      if (req.url === "/control/received") return res.end(JSON.stringify(received));
      if (req.headers.authorization !== "Bearer test-token") {
        res.statusCode = 401;
        return res.end(JSON.stringify({ Response: "Unauthorized" }));
      }
      if (fail) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ Response: "Service unavailable" }));
      }
      const payload = JSON.parse(body);
      received.push(payload);
      n++;
      res.end(JSON.stringify({ InvoiceNumber: `FBR${String(payload.POSID)}-${String(n).padStart(6, "0")}`, Code: "100", Response: "Fiscal Invoice Number generated successfully.", Errors: null }));
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
