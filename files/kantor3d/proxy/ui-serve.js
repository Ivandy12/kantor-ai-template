"use strict";
/*
 * Sajikan UI Paperclip versi Kantor AI (tema + Bahasa Indonesia + menu kantor) dari
 * /opt/data/kantor3d/paperclip-ui-dist. API tetap ke Paperclip asli.
 * Saklar balik ke UI asli: buat file /opt/data/kantor3d/UI_ASLI (tanpa restart).
 */
const fs = require("fs");
const path = require("path");

const DIST = process.env.KANTOR_UI_DIST || "/opt/data/kantor3d/paperclip-ui-dist";
const FLAG_ASLI = "/opt/data/kantor3d/UI_ASLI";
const BRANDING =
  "/opt/data/.npm-global/lib/node_modules/paperclipai/node_modules/@paperclipai/server/dist/ui-branding.js";

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".wasm": "application/wasm",
};

let applyUiBranding = (html) => html;
import(BRANDING)
  .then((m) => {
    if (typeof m.applyUiBranding === "function") applyUiBranding = m.applyUiBranding;
  })
  .catch((e) => console.error("[kantor-ui] branding tidak termuat:", e && e.message));

function aktif() {
  return !fs.existsSync(FLAG_ASLI) && fs.existsSync(path.join(DIST, "index.html"));
}

function fileDalamDist(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const full = path.normalize(path.join(DIST, p));
  if (!full.startsWith(DIST + path.sep)) return null;
  try {
    const st = fs.statSync(full);
    return st.isFile() ? full : null;
  } catch {
    return null;
  }
}

function kirimFile(res, full, cache) {
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cache,
  });
  fs.createReadStream(full).pipe(res);
}

function kirimIndex(res) {
  let html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  try {
    html = applyUiBranding(html);
  } catch {}
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(html);
}

/** true kalau request sudah dilayani di sini. */
function tangani(req, res, wantsHtml) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!aktif()) return false;
  const p = (req.url || "/").split("?")[0];
  if (p.startsWith("/api/") || p === "/api") return false;
  if (p === "/" || p === "/index.html") {
    kirimIndex(res);
    return true;
  }
  const full = p.length > 1 ? fileDalamDist(p) : null;
  if (full) {
    const base = path.basename(full);
    const cache = p.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : base === "sw.js" || base === "index.html"
        ? "no-cache"
        : "public, max-age=3600";
    kirimFile(res, full, cache);
    return true;
  }
  // Aset lama (hash dari UI asli) → biar Paperclip yang jawab.
  if (p.startsWith("/assets/")) return false;
  if (wantsHtml) {
    kirimIndex(res);
    return true;
  }
  return false;
}

module.exports = { tangani, aktif };
