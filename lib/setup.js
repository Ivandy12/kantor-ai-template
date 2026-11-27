#!/usr/bin/env node
// Kantor AI — setup akun owner, perusahaan, kunci board, dan agent Arga lewat API Paperclip.
// Input lewat env: PC_URL, OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME, BRAND, INVITE_TOKEN (opsional),
// MODEL, KA (folder kantor). Output: JSON di stdout {companyId, argaId, userId}.
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = (process.env.PC_URL || "http://127.0.0.1:3201").replace(/\/$/, "");
const KA = process.env.KA || "/opt/data/kantor";
const KEYFILE = path.join(KA, ".board.key");
const log = (...a) => console.error("[setup]", ...a);
const die = (m) => { console.error("[setup][GAGAL]", m); process.exit(1); };

let cookie = "";
const ORIGINS = [process.env.PUBLIC_URL, BASE, "http://localhost:3201"].filter(Boolean).map((o) => o.replace(/\/$/, ""));
let origin = ORIGINS[0];
let key = "";
try { key = fs.readFileSync(KEYFILE, "utf8").trim(); } catch {}

async function api(method, p, body, useCookie = false) {
  const headers = { "Content-Type": "application/json", Origin: origin };
  if (useCookie) headers.Cookie = cookie;
  else if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}
const list = (d) => (Array.isArray(d) ? d : (d && (d.items || d.data || d.agents || d.companies)) || []);

async function waitHealth() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(BASE + "/api/health"); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  die("Paperclip tidak merespon di " + BASE);
}

async function login() {
  const email = process.env.OWNER_EMAIL, password = process.env.OWNER_PASSWORD;
  if (!email || !password) die("OWNER_EMAIL / OWNER_PASSWORD kosong");
  let r;
  for (const o of ORIGINS) { // better-auth menolak Origin yang tidak dipercaya (403) -> coba origin berikutnya
    origin = o;
    r = await api("POST", "/api/auth/sign-up/email", { email, password, name: process.env.OWNER_NAME || "Owner" }, true);
    if (r.status !== 403) break;
  }
  if (!r.ok) {
    log("akun sudah ada (" + r.status + "), login");
    r = await api("POST", "/api/auth/sign-in/email", { email, password }, true);
    if (!r.ok) die("Login gagal: email/password salah (" + JSON.stringify(r.data).slice(0, 200) + ")");
  }
  return r.data && r.data.user && r.data.user.id;
}

async function acceptInvite(tok) {
  for (let i = 0; i < 5; i++) {
    await waitHealth();
    const a = await api("POST", `/api/invites/${tok}/accept`, { requestType: "human" }, true);
    if (a.ok || a.status === 409) { log("undangan admin diterima"); return true; }
    log("undangan admin: " + a.status + " " + JSON.stringify(a.data).slice(0, 160) + " (coba lagi)");
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

// Cadangan: jadikan akun owner admin pertama langsung di database (sama dengan yang dilakukan undangan bootstrap).
// Hanya jalan kalau BELUM ada admin sama sekali.
async function promoteViaDb(userId) {
  if (!userId) die("ID akun tidak diketahui, tidak bisa dijadikan admin");
  let Pool;
  try { ({ Pool } = require(process.env.PG_MODULE)); } catch (e) { die("modul database tidak ditemukan: " + process.env.PG_MODULE); }
  const pool = new Pool({ host: "127.0.0.1", port: parseInt(process.env.PG_PORT || "54330", 10), user: "paperclip", password: "paperclip", database: "paperclip", max: 1 });
  try {
    const u = await pool.query('select id from "user" where id = $1', [userId]);
    if (!u.rowCount) die("akun owner tidak ada di database port " + process.env.PG_PORT + " (database salah?)");
    const c = await pool.query("select count(*)::int n from instance_user_roles where role = 'instance_admin'");
    if (c.rows[0].n > 0) {
      const me = await pool.query("select 1 from instance_user_roles where role = 'instance_admin' and user_id = $1", [userId]);
      if (!me.rowCount) die("Sudah ada admin lain di kantor ini. Login pakai akun admin yang lama.");
      log("akun sudah admin"); return;
    }
    await pool.query("insert into instance_user_roles (user_id, role) values ($1, 'instance_admin')", [userId]);
    log("akun owner dijadikan admin (lewat database)");
  } finally { await pool.end(); }
}

async function ensureBoardKey() {
  const invite = process.env.INVITE_TOKEN;
  let keyOk = false;
  if (key) {
    keyOk = (await api("GET", "/api/companies")).ok;
    log(keyOk ? "kunci board lama masih valid" : "kunci board lama tidak valid");
    if (!keyOk) key = "";
  }
  let userId = null;
  if (!keyOk || invite) {
    userId = await login();
    if (invite && !(await acceptInvite(invite))) {
      log("undangan tidak bisa dipakai, jadikan admin lewat database");
      await promoteViaDb(userId);
    }
  }
  if (!keyOk) {
    const k = await api("POST", "/api/board-api-keys", { name: "kantor-sistem", expiresAt: null }, true);
    if (!k.ok || !k.data.token) die("Gagal bikin kunci board: " + k.status + " " + JSON.stringify(k.data).slice(0, 300));
    key = k.data.token;
    fs.mkdirSync(KA, { recursive: true });
    fs.writeFileSync(KEYFILE, key + "\n", { mode: 0o600 });
    log("kunci board dibuat (tidak kedaluwarsa)");
  }
  return userId;
}

function writeCliAuth(userId) {
  const home = process.env.PAPERCLIP_HOME || "/opt/data/home/.paperclip";
  const f = path.join(home, "auth.json");
  let cur = { version: 1, credentials: {} };
  try { cur = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  cur.credentials = cur.credentials || {};
  const now = new Date().toISOString();
  for (const b of ["http://127.0.0.1:3200", "http://127.0.0.1:3201"]) {
    const prev = cur.credentials[b] || {};
    cur.credentials[b] = { apiBase: b, token: key, createdAt: prev.createdAt || now, updatedAt: now, userId: userId || prev.userId || null };
  }
  fs.writeFileSync(f, JSON.stringify(cur, null, 2), { mode: 0o600 });
}

async function ensureCompany() {
  const r = await api("GET", "/api/companies");
  if (!r.ok) die("Tidak bisa baca perusahaan: " + r.status);
  const c = list(r.data).find((x) => x.status !== "archived");
  if (c) { log("perusahaan sudah ada: " + c.name); return c; }
  const n = await api("POST", "/api/companies", { name: process.env.BRAND || "Kantor AI" });
  if (n.status === 403) die("Akun belum jadi admin (undangan admin belum diterima). Jalankan ulang install dengan email & password yang sama.");
  if (!n.ok) die("Gagal bikin perusahaan: " + n.status + " " + JSON.stringify(n.data).slice(0, 300));
  log("perusahaan dibuat: " + n.data.name + " (" + n.data.issuePrefix + ")");
  return n.data;
}

// rekrut agent selalu lewat persetujuan owner di Inbox (1 klik, lalu agent otomatis aktif)
async function setHireApproval(companyId, on) {
  const r = await api("PATCH", `/api/companies/${companyId}`, { requireBoardApprovalForNewAgents: on });
  if (!r.ok) log("⚠️ gagal atur persetujuan rekrut (" + r.status + ")");
  return r.ok;
}

// update: instruksi Arga ikut versi template terbaru
async function refreshArgaInstructions(arga) {
  const content = fs.readFileSync(path.join(KA, "ceo", "AGENTS.md"), "utf8");
  const cur = await api("GET", `/api/agents/${arga.id}/instructions-bundle/file?path=AGENTS.md`);
  if (cur.ok && cur.data && cur.data.content === content) { log("instruksi Geto Suguru sudah versi terbaru"); return; }
  const body = { path: "AGENTS.md", content, baseRevisionId: (cur.ok && cur.data && cur.data.revision && cur.data.revision.id) || null };
  if (cur.ok && cur.data && cur.data.contentHash) body.baseHash = cur.data.contentHash;
  const r = await api("PUT", `/api/agents/${arga.id}/instructions-bundle/file`, body);
  log(r.ok ? "instruksi Geto Suguru diperbarui" : "⚠️ instruksi Arga gagal diperbarui (" + r.status + " " + JSON.stringify(r.data).slice(0, 150) + ")");
}

async function ensureArga(companyId) {
  const r = await api("GET", `/api/companies/${companyId}/agents`);
  if (!r.ok) die("Tidak bisa baca agent: " + r.status);
  const ceo = list(r.data).find((a) => a.role === "ceo" && a.status !== "terminated");
  if (ceo) { log("Geto Suguru (CEO) sudah ada"); await refreshArgaInstructions(ceo); return ceo; }
  // Arga (CEO pertama) dibuat langsung oleh owner: matikan sementara aturan persetujuan rekrut
  await setHireApproval(companyId, false);
  const instr = fs.readFileSync(path.join(KA, "ceo", "AGENTS.md"), "utf8");
  const payload = {
    name: "Geto Suguru",
    role: "ceo",
    title: "CEO",
    icon: "crown",
    capabilities: "Memecah target bisnis jadi tugas, mendelegasikan ke staf Jujutsu High, mereview hasil, mengajukan rekrut agent JJK, lapor ke Sensei Gojo Satoru.",
    appearance: { schemaVersion: 1, characterVersion: "cap-v1", paletteId: "lime-lagoon" },
    adapterType: "hermes_local",
    adapterConfig: {
      model: process.env.MODEL,
      provider: "auto",
      toolsets: "terminal,file,skills,memory,web,todo",
      maxTurnsPerRun: 30,
      timeoutSec: 1200,
      persistSession: true,
      quiet: true,
      cwd: path.join(KA, "ceo", "workspace"),
      hermesCommand: path.join(KA, "tools", "hermes-run"),
      paperclipApiUrl: (process.env.PC_URL || "http://127.0.0.1:3201"),
      env: {
        HOME: { type: "plain", value: "/opt/data" },
        HERMES_HOME: { type: "plain", value: "/opt/data/profiles/kantorceo" },
        TERMINAL_CWD: { type: "plain", value: path.join(KA, "ceo", "workspace") },
        PAPERCLIP_API_URL: { type: "plain", value: (process.env.PC_URL || "http://127.0.0.1:3201") },
      },
    },
    runtimeConfig: { heartbeat: { enabled: false, maxConcurrentRuns: 20, maxTurnContinuation: { enabled: true, maxAttempts: 3, delayMs: 5000 } } },
    instructionsBundle: { entryFile: "AGENTS.md", files: { "AGENTS.md": instr } },
    desiredSkills: ["paperclip", "paperclip-converting-plans-to-tasks", "paperclip-create-agent"],
    permissions: { canCreateAgents: true, canCreateSkills: true },
  };
  let n = await api("POST", `/api/companies/${companyId}/agents`, payload);
  if (!n.ok) {
    log("bikin Geto Suguru dengan skill gagal (" + n.status + "), coba tanpa daftar skill");
    delete payload.desiredSkills;
    n = await api("POST", `/api/companies/${companyId}/agents`, payload);
  }
  if (!n.ok) die("Gagal bikin Geto Suguru: " + n.status + " " + JSON.stringify(n.data).slice(0, 400));
  const a = n.data.agent || n.data;
  log("Geto Suguru (CEO) dibuat");
  return a;
}

// v1.5: batas langkah lebih hemat (CEO 30, staf 45) + lanjut otomatis maks 3x supaya tidak muter boros token
async function migrateAgentLimits(companyId) {
  let Pool;
  try { ({ Pool } = require(process.env.PG_MODULE)); } catch (e) { log("lewati migrasi agent: modul database tidak ada"); return; }
  const pool = new Pool({ host: "127.0.0.1", port: parseInt(process.env.PG_PORT || "54330", 10), user: "paperclip", password: "paperclip", database: "paperclip", max: 1 });
  try {
    const r = await pool.query(`update agents set
        adapter_config = adapter_config || jsonb_build_object('provider', 'auto') || jsonb_build_object(
          'maxTurnsPerRun', case when role = 'ceo' then 30 else 45 end,
          'timeoutSec', greatest(coalesce((adapter_config->>'timeoutSec')::int, 0), case when role = 'ceo' then 1200 else 1800 end)),
        runtime_config = jsonb_set(coalesce(runtime_config, '{}'::jsonb), '{heartbeat,maxTurnContinuation}',
          '{"enabled":true,"maxAttempts":3,"delayMs":5000}'::jsonb, true)
      where company_id = $1 and adapter_type = 'hermes_local' and status <> 'terminated'`, [companyId]);
    log("batas langkah agent diperbarui (" + r.rowCount + " agent)");
  } catch (e) { log("migrasi agent dilewati: " + e.message); } finally { await pool.end(); }
}


// v1.4.1: aturan riset & anti-muter ikut masuk ke instruksi staf yang sudah ada
async function refreshStaffRules(companyId, argaId) {
  let rules = "";
  try { rules = fs.readFileSync(path.join(KA, "_shared_rules.md"), "utf8"); } catch { return; }
  const a = rules.indexOf("## Riset (TANPA approval)"), b = rules.indexOf("## Kerjaan besar");
  if (a < 0 || b < a) return;
  const add = rules.slice(a, b);
  const h0 = rules.indexOf("## Hemat & cepat"), h1 = h0 < 0 ? -1 : rules.indexOf("\n## ", h0 + 5);
  const hemat = h0 < 0 ? "" : rules.slice(h0, h1 < 0 ? undefined : h1 + 1);
  const list = await api("GET", `/api/companies/${companyId}/agents`);
  if (!list.ok || !Array.isArray(list.data)) return;
  let n = 0;
  for (const ag of list.data) {
    if (ag.id === argaId || ag.status === "terminated" || ag.adapterType !== "hermes_local") continue;
    const cur = await api("GET", `/api/agents/${ag.id}/instructions-bundle/file?path=AGENTS.md`);
    if (!cur.ok || !cur.data || typeof cur.data.content !== "string") continue;
    let c = cur.data.content;
    if (!c.includes("## Riset (TANPA approval)")) c = c.includes("## Kerjaan besar") ? c.replace("## Kerjaan besar", add + "## Kerjaan besar") : c + "\n" + add;
    if (hemat && !c.includes("## Hemat & cepat")) c = c.includes("## Atasan & lapor") ? c.replace("## Atasan & lapor", hemat + "\n## Atasan & lapor") : c + "\n" + hemat;
    if (c === cur.data.content) continue;
    const body = { path: "AGENTS.md", content: c, baseRevisionId: (cur.data.revision && cur.data.revision.id) || null };
    if (cur.data.contentHash) body.baseHash = cur.data.contentHash;
    const r = await api("PUT", `/api/agents/${ag.id}/instructions-bundle/file`, body);
    if (r.ok) n++;
  }
  log("aturan kerja (riset, anti-muter, hemat) diperbarui di " + n + " staf");
}

(async () => {
  await waitHealth();
  const userId = await ensureBoardKey();
  writeCliAuth(userId);
  const company = await ensureCompany();
  const arga = await ensureArga(company.id);
  // setelah Arga ada: semua rekrut berikutnya wajib persetujuan owner di Inbox
  if (await setHireApproval(company.id, true)) log("rekrut agent JJK wajib persetujuan Sensei Gojo: aktif");
  await migrateAgentLimits(company.id);
  try { await refreshStaffRules(company.id, arga.id); } catch (e) { log("aturan staf dilewati: " + e.message); }
  console.log(JSON.stringify({ companyId: company.id, issuePrefix: company.issuePrefix, argaId: arga.id, userId }));
})().catch((e) => die(e && e.stack ? e.stack : String(e)));
