"use strict";
// Endpoint Pengaturan Model AI: GET /__kantor/model-ai (status), POST {action:"test"|"apply", ...}
const { spawn } = require("child_process");
const PATH = "/__kantor/model-ai";
const TG_PATH = "/__kantor/telegram";
const TOOL = "/opt/data/kantor/tools/model_ai.py";
const TG_TOOL = "/opt/data/kantor/tools/telegram_hermes.py";
let busy = false;

function run(cmd, input, timeoutMs, tool = TOOL) {
  return new Promise((resolve) => {
    const ch = spawn("/opt/hermes/.venv/bin/python", [tool, cmd], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => ch.kill("SIGKILL"), timeoutMs);
    ch.stdout.on("data", (d) => (out += d));
    ch.stderr.on("data", (d) => (err += d));
    ch.on("close", () => {
      clearTimeout(t);
      try { resolve(JSON.parse(out.trim().split("\n").pop())); }
      catch { resolve({ ok: false, error: "Tool error: " + (err || out).slice(-300) }); }
    });
    ch.stdin.end(input ? JSON.stringify(input) : "");
  });
}

function handle(req, res, isLoggedIn) {
  const p = (req.url || "").split("?")[0];
  if (p === TG_PATH) return handleTelegram(req, res, isLoggedIn);
  if (p !== PATH) return false;
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  (async () => {
    if (!(await isLoggedIn(req))) return send(401, { ok: false, error: "Login dulu." });
    if (req.method === "GET") return send(200, await run("status", null, 30000));
    if (req.method !== "POST") return send(405, { ok: false, error: "Method?" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      let b = {}; try { b = JSON.parse(body || "{}"); } catch {}
      if (b.action === "test") return send(200, await run("test", b, 120000));
      if (b.action === "models") return send(200, await run("models", null, 30000));
      if (b.action === "agent_model") return send(200, await run("agent_model", b, 120000));
      if (b.action === "apply") {
        if (busy) return send(409, { ok: false, error: "Lagi menerapkan, tunggu sebentar." });
        busy = true;
        try { return send(200, await run("apply", b, 180000)); } finally { busy = false; }
      }
      send(400, { ok: false, error: "Aksi tidak dikenal." });
    });
  })().catch((e) => send(500, { ok: false, error: String(e) }));
  return true;
}
// v1.5: sambungkan bot Telegram Hermes utama dari web (token + ID pemilik)
let tgBusy = false;
function handleTelegram(req, res, isLoggedIn) {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  (async () => {
    if (!(await isLoggedIn(req))) return send(401, { ok: false, error: "Login dulu." });
    if (req.method === "GET") return send(200, await run("status", null, 30000, TG_TOOL));
    if (req.method !== "POST") return send(405, { ok: false, error: "Method?" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 5000) req.destroy(); });
    req.on("end", async () => {
      let b = {}; try { b = JSON.parse(body || "{}"); } catch {}
      if (b.action === "detect") return send(200, await run("detect", b, 60000, TG_TOOL));
      if (b.action === "apply" || b.action === "off") {
        if (tgBusy) return send(409, { ok: false, error: "Lagi diproses, tunggu sebentar." });
        tgBusy = true;
        try { return send(200, await run(b.action, b.action === "apply" ? b : null, 120000, TG_TOOL)); } finally { tgBusy = false; }
      }
      send(400, { ok: false, error: "Aksi tidak dikenal." });
    });
  })().catch((e) => send(500, { ok: false, error: String(e) }));
  return true;
}

module.exports = { handle, PATH, TG_PATH };
