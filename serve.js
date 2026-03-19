#!/usr/bin/env node
/**
 * Simple HTTPS dev server.
 *
 * Mobile browsers require HTTPS for camera, geolocation, and
 * DeviceOrientation APIs. This generates a self-signed cert on the fly.
 *
 * Usage:
 *   node serve.js [port]          # defaults to 8443
 *
 * Then open https://<your-ip>:8443 on your phone (accept the cert warning).
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = parseInt(process.argv[2], 10) || 8443;
const CERT_DIR = path.join(__dirname, ".certs");
const KEY = path.join(CERT_DIR, "key.pem");
const CERT = path.join(CERT_DIR, "cert.pem");

// Generate self-signed cert if it doesn't exist
if (!fs.existsSync(KEY) || !fs.existsSync(CERT)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log("Generating self-signed TLS certificate…");
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${KEY}" -out "${CERT}" ` +
      `-days 365 -nodes -subj "/CN=localhost"`,
    { stdio: "inherit" }
  );
}

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = https.createServer(
  { key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) },
  (req, res) => {
    let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  }
);

server.listen(PORT, "0.0.0.0", () => {
  const ifaces = require("os").networkInterfaces();
  console.log(`\n  AR Waypoints server running on:\n`);
  console.log(`    https://localhost:${PORT}`);
  Object.values(ifaces)
    .flat()
    .filter((i) => i.family === "IPv4" && !i.internal)
    .forEach((i) => console.log(`    https://${i.address}:${PORT}`));
  console.log(`\n  Open the URL on your phone and accept the certificate warning.\n`);
});
