"use strict";
/* Suntik <script src="/__kantor/inject.js"> ke halaman HTML Paperclip. */
const fs = require("fs");
const path = require("path");

const INJECT_PATH = "/__kantor/inject.js";
const TAG = `<script src="${INJECT_PATH}" defer></script>`;

function serveInject(res) {
  try {
    const js = fs.readFileSync(path.join(__dirname, "inject.js"));
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(js);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

function wantsHtml(req) {
  if (req.method !== "GET") return false;
  const p = (req.url || "").split("?")[0];
  if (p.startsWith("/api/") || p.startsWith("/assets/") || /\.[a-z0-9]{2,5}$/i.test(p)) return false;
  const dest = String(req.headers["sec-fetch-dest"] || "");
  const mode = String(req.headers["sec-fetch-mode"] || "");
  const accept = String(req.headers.accept || "");
  if (dest === "document" || dest === "iframe" || mode === "navigate") return true;
  // Service worker Paperclip mengambil ulang navigasi (dest bisa "empty" di iOS).
  if (["script", "style", "image", "font", "manifest", "worker", "serviceworker"].includes(dest)) return false;
  return accept.includes("text/html");
}

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "content-length", "content-encoding"]);

/** Ambil HTML dari Paperclip, suntik script, kirim ke browser. Return false kalau gagal (pakai proxy biasa). */
async function proxyHtml(req, res, target) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === "accept-encoding" || HOP.has(k)) continue;
    headers[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  headers["accept-encoding"] = "identity";
  const ip = req.socket.remoteAddress || "";
  headers["x-forwarded-for"] = headers["x-forwarded-for"] ? `${headers["x-forwarded-for"]}, ${ip}` : ip;
  if (!headers["x-forwarded-host"] && req.headers.host) headers["x-forwarded-host"] = req.headers.host;
  if (!headers["x-forwarded-proto"]) headers["x-forwarded-proto"] = "http";

  let up;
  try {
    up = await fetch(target + req.url, { method: "GET", headers, redirect: "manual" });
  } catch {
    return false;
  }
  const outHeaders = {};
  up.headers.forEach((v, k) => {
    if (HOP.has(k) || k === "set-cookie") return;
    outHeaders[k] = v;
  });
  const cookies = typeof up.headers.getSetCookie === "function" ? up.headers.getSetCookie() : [];
  if (cookies.length) outHeaders["set-cookie"] = cookies;

  const ctype = up.headers.get("content-type") || "";
  if (!ctype.includes("text/html")) {
    const buf = Buffer.from(await up.arrayBuffer());
    res.writeHead(up.status, outHeaders);
    res.end(buf);
    return true;
  }
  let html = await up.text();
  if (!html.includes(INJECT_PATH)) {
    html = html.includes("</head>") ? html.replace("</head>", `${TAG}</head>`) : html + TAG;
  }
  outHeaders["cache-control"] = "no-cache";
  res.writeHead(up.status, outHeaders);
  res.end(html);
  return true;
}

module.exports = { INJECT_PATH, serveInject, wantsHtml, proxyHtml };
