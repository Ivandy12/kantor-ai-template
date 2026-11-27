"use strict";
/*
 * Pintu depan port 3100 (satu-satunya port yang dibuka Sumopod).
 *   /kantor3d/...            -> Kantor 3D (Hermes3D, basePath /kantor3d)
 *   /api/gateway/ws          -> Kantor 3D (websocket gateway)
 *   request dari halaman /kantor3d (Referer) ke /api, /office-assets, dll -> Kantor 3D (+prefix)
 *   selain itu               -> Paperclip (apa adanya)
 * Kantor 3D cuma bisa dibuka kalau sudah login Paperclip (cek sesi Paperclip).
 */
const http = require("http");
const crypto = require("crypto");
const httpProxy = require("http-proxy");
const inject = require("./html-inject");
const ui = require("./ui-serve");
const modelAi = require("./model-ai");

const LISTEN_PORT = parseInt(process.env.PROXY_PORT || "3200", 10);
const PAPERCLIP = process.env.PAPERCLIP_TARGET || "http://127.0.0.1:3201";
const KANTOR3D = process.env.KANTOR3D_TARGET || "http://127.0.0.1:3400";
const BASE = "/kantor3d";

const proxy = httpProxy.createProxyServer({ xfwd: false, ws: true, proxyTimeout: 0, timeout: 0 });
proxy.on("proxyReq", (proxyReq, req) => {
  const rawProto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  const cleanProto = String(rawProto).split(",")[0].trim();
  proxyReq.setHeader("x-forwarded-proto", cleanProto);
  const rawFor = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (rawFor) proxyReq.setHeader("x-forwarded-for", rawFor);
});
proxy.on("proxyReqWs", (proxyReq, req) => {
  const rawProto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  const cleanProto = String(rawProto).split(",")[0].trim();
  proxyReq.setHeader("x-forwarded-proto", cleanProto);
});
proxy.on("error", (err, req, res) => {
  try {
    if (res && typeof res.writeHead === "function" && !res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Kantor lagi restart, coba refresh sebentar lagi.");
    } else if (res && typeof res.destroy === "function") {
      res.destroy();
    }
  } catch {}
});

function route(req) {
  const url = new URL(req.url, "http://local");
  const p = url.pathname;
  if (p === BASE || p.startsWith(BASE + "/")) return { k3d: true, url: req.url };
  if (p === "/api/gateway/ws") return { k3d: true, url: req.url };
  const dest = String(req.headers["sec-fetch-dest"] || "");
  const isNavigation = dest === "document" || dest === "iframe";
  const ref = req.headers.referer;
  if (ref && !isNavigation) {
    try {
      const rp = new URL(ref).pathname;
      if (rp === BASE || rp.startsWith(BASE + "/")) return { k3d: true, url: BASE + req.url };
    } catch {}
  }
  return { k3d: false, url: req.url };
}

// ---- Cek login Paperclip (cache 60 detik per cookie)
const sessionCache = new Map();
let DEBUG_TOKEN = "";
try { DEBUG_TOKEN = require("fs").readFileSync("/opt/data/kantor3d/state/debug.token", "utf8").trim(); } catch {}
async function isLoggedIn(req) {
  // Akses debug lokal (tes otomatis di VPS): header rahasia, hanya dari loopback.
  if (DEBUG_TOKEN && DEBUG_TOKEN.length >= 20 && (req.headers["x-kantor-debug"] === DEBUG_TOKEN || (req.headers.cookie || "").includes("kantor_debug=" + DEBUG_TOKEN)) &&
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "")) return true;
  const cookie = req.headers.cookie || "";
  if (!cookie) return false;
  const key = crypto.createHash("sha256").update(cookie).digest("hex");
  const hit = sessionCache.get(key);
  if (hit && hit.until > Date.now()) return hit.ok;
  let ok = false;
  try {
    const res = await fetch(PAPERCLIP + "/api/auth/get-session", {
      headers: { cookie, host: req.headers.host || "localhost", "x-forwarded-proto": "https" },
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      ok = Boolean(body && (body.user || body.session));
    }
  } catch {}
  sessionCache.set(key, { ok, until: Date.now() + (ok ? 60000 : 5000) });
  if (sessionCache.size > 500) sessionCache.clear();
  return ok;
}

const server = http.createServer(async (req, res) => {
  if ((req.url || "").split("?")[0] === inject.INJECT_PATH) return inject.serveInject(res);
  // Screenshot debug (path acak, hanya gambar kantor dari tes headless)
  try {
    const sp = require("fs").readFileSync("/opt/data/kantor3d/state/shot.path", "utf8").trim();
    if (sp && (req.url || "").split("?")[0] === "/__kantor/shot-" + sp + ".png") {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      return require("fs").createReadStream("/opt/data/kantor3d/tasks/k3d.png").pipe(res);
    }
  } catch {}
  // Log navigasi halaman (diagnosa redirect)
  if (inject.wantsHtml(req)) console.log("[nav]", new Date().toISOString(), req.url, "ref=" + (req.headers.referer || "-"));
  // Root dengan ?next= lama ke kantor 3D → buang, biar masuk Paperclip
  {
    const u = new URL(req.url || "/", "http://x");
    if (u.pathname === "/" && (u.searchParams.get("next") || "").startsWith("/kantor3d")) {
      res.writeHead(302, { Location: "/", "Cache-Control": "no-store" });
      return res.end();
    }
  }
  // Pengaturan Model AI (endpoint + API key untuk semua agent)
  if (modelAi.handle(req, res, isLoggedIn)) return;
  // Rapat: pause / lanjut / Pak Fauzy ikut ngomong (langsung ke adapter, tanpa rebuild Hermes3D)
  if ((req.url || "").split("?")[0] === "/__kantor/meeting" && req.method === "POST") {
    if (!(await isLoggedIn(req))) { res.writeHead(401); return res.end("Login dulu."); }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", () => {
      let b = {};
      try { b = JSON.parse(body || "{}"); } catch {}
      const OK = new Set(["kantor.meeting.pause", "kantor.meeting.resume", "kantor.meeting.say", "kantor.meeting.get", "kantor.meeting.continue"]);
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
      if (!OK.has(b.method)) return send(400, { error: "Method tidak dikenal." });
      const ws = new WebSocket(process.env.KANTOR_ADAPTER_URL || "ws://127.0.0.1:18790");
      let done = false;
      const fin = (code, obj) => { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch {} send(code, obj); };
      const t = setTimeout(() => fin(504, { error: "Adapter nggak merespons." }), 15000);
      ws.onerror = () => fin(502, { error: "Adapter error." });
      ws.onopen = () => ws.send(JSON.stringify({ type: "req", id: "c", method: "connect", params: {} }));
      ws.onmessage = (ev) => {
        let f; try { f = JSON.parse(String(ev.data)); } catch { return; }
        if (f.type !== "res") return;
        if (f.id === "c") return ws.send(JSON.stringify({ type: "req", id: "m", method: b.method, params: b.params || {} }));
        if (f.id === "m") fin(f.ok ? 200 : 500, f.ok ? f.payload || {} : { error: (f.error && f.error.message) || "Gagal." });
      };
    });
    return;
  }
  const r = route(req);
  if (!r.k3d) {
    // UI Paperclip versi Kantor AI (kalau aktif). Kalau tidak, pakai suntikan menu.
    if (ui.tangani(req, res, inject.wantsHtml(req))) return;
    if (!ui.aktif() && inject.wantsHtml(req)) {
      try {
        if (await inject.proxyHtml(req, res, PAPERCLIP)) return;
      } catch (e) {
        console.error("[kantor-proxy] inject gagal", e && e.message);
        if (res.headersSent) return res.end();
      }
    }
    return proxy.web(req, res, { target: PAPERCLIP });
  }
  if (!(await isLoggedIn(req))) {
    const dest = String(req.headers["sec-fetch-dest"] || "");
    if (dest === "document" || req.method === "GET" && (req.headers.accept || "").includes("text/html")) {
      res.writeHead(302, { Location: "/auth?next=" + encodeURIComponent(req.url) });
      return res.end();
    }
    res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Login Paperclip dulu.");
  }
  req.url = r.url;
  proxy.web(req, res, { target: KANTOR3D });
});

server.on("upgrade", async (req, socket, head) => {
  const r = route(req);
  if (!r.k3d) return proxy.ws(req, socket, head, { target: PAPERCLIP });
  if (!(await isLoggedIn(req))) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  req.url = r.url;
  proxy.ws(req, socket, head, { target: KANTOR3D });
});

server.keepAliveTimeout = 65000;

// Penjaga Kantor 3D: kembalikan koneksi gateway ke adapter kantor kalau tertimpa pengaturan bawaan Hermes3D
// (gejala: kantor 3D macet di layar "HERMES3D"). Dicek tiap 60 detik.
{
  const { execFile } = require("child_process");
  const GUARD = "/opt/data/kantor/tools/fix-3d-gateway.py";
  const runGuard = () => execFile("python3", [GUARD], { timeout: 20000 }, (err, out) => { if (out && out.trim()) console.log(out.trim()); });
  if (require("fs").existsSync(GUARD)) { runGuard(); setInterval(runGuard, 60000).unref(); }
}
server.listen(LISTEN_PORT, "0.0.0.0", () => console.log(`[kantor-proxy] :${LISTEN_PORT} -> paperclip ${PAPERCLIP}, kantor3d ${KANTOR3D}`));
