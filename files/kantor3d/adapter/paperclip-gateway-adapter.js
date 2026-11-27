"use strict";
/*
 * Kantor AI — adapter gateway Hermes3D yang datanya dari Paperclip.
 *
 * - Daftar agent & status kerja diambil dari database Paperclip (read-only).
 * - Chat langsung: tiap agent dijalankan lewat profil Hermes-nya sendiri
 *   (`hermes chat`, toolset aman: web & session_search), riwayat disimpan per agent.
 * - Aksi berisiko tetap lewat Paperclip: "Jadikan tugas" bikin issue ke CEO,
 *   jalur eskalasi/approval Paperclip tidak dilewati.
 * - Rapat & debat: lihat meeting.js.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = parseInt(process.env.KANTOR_ADAPTER_PORT || "18790", 10);
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "f90ba27e-b4f1-4949-bece-2e8fb3500948";
const PAPERCLIP_URL = process.env.PAPERCLIP_URL || "http://127.0.0.1:3201";
const PAPERCLIP_HOME = process.env.PAPERCLIP_HOME || "/opt/data/home/.paperclip";
const PG_MODULE =
  process.env.PAPERCLIP_PG_MODULE ||
  "/opt/data/.npm-global/lib/node_modules/paperclipai/node_modules/pg";
const HERMES_BIN = process.env.HERMES_BIN || "/opt/hermes/.venv/bin/hermes";
const STATE_DIR = process.env.KANTOR_STATE_DIR || path.join(__dirname, "..", "state");
const CHAT_TOOLSETS = process.env.KANTOR_CHAT_TOOLSETS || "web,session_search";
const MAIN_KEY = "main";

fs.mkdirSync(STATE_DIR, { recursive: true });

const { Pool } = require(PG_MODULE);
const pool = new Pool({
  host: "127.0.0.1",
  port: 54329,
  user: "paperclip",
  password: "paperclip",
  database: "paperclip",
  max: 3,
});

// ---------------------------------------------------------------- Paperclip API

let boardToken = null;
function loadBoardToken() {
  const auth = JSON.parse(fs.readFileSync(path.join(PAPERCLIP_HOME, "auth.json"), "utf8"));
  let found = null;
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (["token", "accesstoken", "apikey"].includes(k.toLowerCase()) && typeof v === "string" && v.length > 20) found = v;
        else walk(v);
      }
    }
  };
  walk(auth);
  boardToken = found;
}

async function pcApi(method, apiPath, body) {
  if (!boardToken) loadBoardToken();
  const res = await fetch(PAPERCLIP_URL + apiPath, {
    method,
    headers: { Authorization: `Bearer ${boardToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Paperclip ${method} ${apiPath} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------- Agents

/** @type {Map<string, any>} */
let agents = new Map();
let ceoId = null;

const cleanName = (name) => String(name || "").replace(/^CEO\s*-\s*/i, "").trim() || "Agent";

async function refreshAgents() {
  const { rows } = await pool.query(
    `select id, name, title, role, status, reports_to,
            adapter_config->'env'->'HERMES_HOME'->>'value' as hermes_home,
            adapter_config->'env'->'TERMINAL_CWD'->>'value' as cwd,
            adapter_config->>'model' as model
       from agents
      where company_id = $1 and status not in ('terminated', 'pending_approval')
      order by case when role = 'ceo' then 0 else 1 end, name`,
    [COMPANY_ID],
  );
  const next = new Map();
  for (const r of rows) {
    if (r.role === "ceo") ceoId = r.id;
    next.set(r.id, {
      id: r.id,
      name: cleanName(r.name),
      fullName: r.name,
      title: r.title || r.role || "",
      role: r.role,
      paperclipStatus: r.status,
      reportsTo: r.reports_to,
      hermesHome: r.hermes_home,
      cwd: r.cwd,
      model: r.model || "",
    });
  }
  agents = next;
}

function agentListPayload() {
  return [...agents.values()].map((a) => ({
    id: a.id,
    name: a.name,
    workspace: a.cwd || "",
    identity: { name: a.name, emoji: a.role === "ceo" ? "👔" : "🤖" },
    role: a.title,
  }));
}

function agentInstructions(agentId) {
  const file = path.join(
    PAPERCLIP_HOME,
    "instances/default/companies",
    COMPANY_ID,
    "agents",
    agentId,
    "instructions/AGENTS.md",
  );
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------- Event fan-out

const sinks = new Set();
function broadcast(frame) {
  for (const send of sinks) {
    try {
      send(frame);
    } catch {}
  }
}

// ---------------------------------------------------------------- Paperclip runs -> status kerja

/** agentId -> { runId, issue } */
let activeRuns = new Map();

async function pollRuns() {
  const { rows } = await pool.query(
    `select r.id, r.agent_id, r.status, r.context_snapshot->>'issueId' as issue_id,
            i.identifier, i.title, (i.created_by_user_id is not null and i.created_by_agent_id is null) as from_boss
       from heartbeat_runs r
       left join issues i on i.id::text = r.context_snapshot->>'issueId'
      where r.company_id = $1 and r.status in ('queued', 'running')`,
    [COMPANY_ID],
  );
  const next = new Map();
  for (const r of rows) {
    if (!next.has(r.agent_id) || r.status === "running") {
      next.set(r.agent_id, { runId: r.id, issue: r.identifier ? `${r.identifier} · ${r.title}` : null, fromBoss: !!r.from_boss });
    }
  }
  for (const [agentId, run] of next) {
    const prev = activeRuns.get(agentId);
    if (!prev || prev.runId !== run.runId) {
      lifecycle(agentId, run.runId, "start");
    }
  }
  for (const [agentId, run] of activeRuns) {
    const now = next.get(agentId);
    if (!now || now.runId !== run.runId) lifecycle(agentId, run.runId, "end");
  }
  activeRuns = next;
}

function lifecycle(agentId, runId, phase) {
  broadcast({
    type: "event",
    event: "agent",
    payload: {
      runId: `pc-${runId}`,
      sessionKey: `agent:${agentId}:${MAIN_KEY}`,
      stream: "lifecycle",
      data: { phase },
      ts: Date.now(),
    },
  });
}

// ---------------------------------------------------------------- Chat state

function statePath(agentId) {
  return path.join(STATE_DIR, `chat-${agentId}.json`);
}
function loadChat(agentId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(agentId), "utf8"));
  } catch {
    return { hermesSessionId: null, messages: [] };
  }
}
function saveChat(agentId, chat) {
  chat.messages = chat.messages.slice(-200);
  fs.writeFileSync(statePath(agentId), JSON.stringify(chat, null, 1));
}

const agentIdFromSession = (key) =>
  typeof key === "string" && key.startsWith("agent:") ? key.split(":")[1] : ceoId;

/**
 * Satu giliran bicara agent lewat profil Hermes-nya. Dipakai chat & rapat.
 * onText dipanggil dengan teks kumulatif.
 */
function runAgentTurn(agent, prompt, { sessionId = null, onText, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (!agent.hermesHome) return reject(new Error(`${agent.name} belum punya profil Hermes.`));
    const args = ["chat", "-Q", "--format", "stream-json", "--query-file", "-"];
    // Claude fix (30 Okt): Hermes baru menolak -t/--toolsets saat --resume (toolset ikut sesi awal) -> cuma dipakai di sesi baru
    if (sessionId) args.push("--resume", sessionId);
    else {
      args.push("-t", CHAT_TOOLSETS);
      // v1.5.1: chat pakai model yang dipilih untuk agent ini (Hermes menolak -m saat --resume)
      if (agent.model) args.push("-m", agent.model);
    }
    const cwd = agent.cwd && fs.existsSync(agent.cwd) ? agent.cwd : STATE_DIR;
    const child = spawn(HERMES_BIN, args, {
      cwd,
      env: { ...process.env, HERMES_HOME: agent.hermesHome, TERMINAL_CWD: cwd, PAPERCLIP_API_KEY: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let text = "";
    let newSession = sessionId;
    let buf = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 240000);
    if (signal) signal.onabort = () => child.kill("SIGTERM");
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.session_id) newSession = ev.session_id;
        if (ev.type === "text" && typeof ev.text === "string") {
          text += ev.text;
          onText?.(text.trimStart());
        } else if (ev.type === "result" && typeof ev.text === "string" && ev.text.trim()) {
          text = ev.text;
        }
      }
    });
    child.stderr.on("data", (c) => (stderr += c.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (signal?.aborted) return resolve({ text: text.trim(), sessionId: newSession, aborted: true });
      if (!text.trim()) return reject(new Error(`Agent nggak bales (exit ${code}). ${stderr.slice(-300)}`));
      resolve({ text: text.trim(), sessionId: newSession });
    });
    child.stdin.end(prompt);
  });
}

function chatPreamble(agent) {
  const boss = agent.reportsTo ? agents.get(agent.reportsTo) : null;
  const instr = agentInstructions(agent.id).slice(0, 6000);
  return [
    `Kamu ${agent.name}, ${agent.title} di kantor AI Digital Strategi.`,
    boss ? `Atasanmu: ${boss.name} (${boss.title}).` : "Kamu CEO, atasanmu langsung Fauzy (Board).",
    "",
    "Peranmu di kantor (dari instruksi resmimu):",
    instr || "(instruksi belum ada)",
    "",
    "=== MODE CHAT LANGSUNG ===",
    "Sekarang Fauzy (pemilik/Board) ngajak kamu ngobrol langsung lewat kantor 3D, BUKAN lewat tugas Paperclip.",
    "- Jawab santai, singkat, bahasa Indonesia sehari-hari (gua/lu boleh).",
    "- Di mode ini kamu TIDAK menjalankan aksi (tidak ubah iklan, tidak kirim apa pun, tidak pakai API Paperclip).",
    "- Kalau Fauzy minta dikerjain sesuatu, jelaskan rencananya lalu bilang: 'Klik Jadikan tugas biar masuk jalur resmi.'",
    "- Jangan mengarang angka/data. Kalau nggak tahu, bilang nggak tahu.",
  ].join("\n");
}

/** runId -> AbortController */
const chatRuns = new Map();

// ---------------------------------------------------------------- Usulan hapus agent (Claude hapus-agent)
// Arga cuma bisa MENGUSULKAN lewat penanda di balasannya. Eksekusi hanya lewat klik Fauzy di kantor 3D.
const USUL_HAPUS_RE = /\[\[USUL_HAPUS:\s*([^|\]]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\]/g;
const MINTA_HAPUS_RE = /\b(hapus|pecat|keluarkan|berhentikan|copot|buang)\b/i;
const usulPath = () => path.join(STATE_DIR, "usul-hapus.json");
function loadUsul() {
  try {
    return JSON.parse(fs.readFileSync(usulPath(), "utf8"));
  } catch {
    return [];
  }
}
const saveUsul = (list) => fs.writeFileSync(usulPath(), JSON.stringify(list, null, 1));
/** Penanda nggak boleh kelihatan di chat, termasuk waktu masih setengah jalan saat streaming. */
const stripUsul = (t) => t.replace(/\[\[USUL_HAPUS:[^\]]*\]\]/g, "").replace(/\[\[[^\]]*$/, "").replace(/\[$/, "").trim();
function hapusNote() {
  const daftar = [...agents.values()].filter((a) => a.id !== ceoId).map((a) => a.name).join(", ");
  return [
    "[Catatan sistem, jangan disebut ke Fauzy: kalau di pesan ini Fauzy benar-benar minta menghapus/memberhentikan agent,",
    "kamu boleh mengusulkannya: tulis jawaban singkat, lalu di akhir jawaban tulis satu penanda per agent: [[USUL_HAPUS: Nama Agent | alasan singkat]].",
    "Fauzy akan menyetujui lewat tombol konfirmasi; kamu sendiri tidak menghapus apa pun, jadi jangan bilang sudah terhapus.",
    `Nama harus persis salah satu dari: ${daftar}. Kalau nggak jelas agent yang mana, tanya dulu tanpa penanda.]`,
  ].join(" ");
}
function catatUsulHapus(text, bossMessage) {
  if (!MINTA_HAPUS_RE.test(bossMessage)) return;
  let list = loadUsul();
  for (const m of text.matchAll(USUL_HAPUS_RE)) { // satu kartu per agent; tiap agent disetujui sendiri-sendiri
    const nama = m[1].toLowerCase();
    const target = [...agents.values()].filter((a) => a.id !== ceoId && a.name.toLowerCase() === nama);
    if (target.length !== 1) continue;
    list = list.filter((u) => u.agentId !== target[0].id);
    list.push({ id: randomUUID(), agentId: target[0].id, agentName: target[0].name, agentTitle: target[0].title, alasan: (m[2] || "").slice(0, 300), ts: Date.now() });
  }
  saveUsul(list);
}
function daftarUsul() {
  const list = loadUsul().filter((u) => agents.has(u.agentId) && Date.now() - u.ts < 86400000);
  return { usulan: list };
}
async function jawabUsul(p, setuju) {
  const list = loadUsul();
  const usul = list.find((u) => u.id === p.id);
  if (!usul) throw new Error("Usulan sudah nggak berlaku.");
  if (setuju) {
    if (usul.agentId === ceoId) throw new Error("CEO nggak bisa dihapus.");
    await pcApi("POST", `/api/agents/${usul.agentId}/terminate`, {});
    await refreshAgents();
  }
  saveUsul(list.filter((u) => u.id !== p.id));
  return { ok: true };
}

async function handleChatSend(p, id, sendEvent) {
  const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey : `agent:${ceoId}:${MAIN_KEY}`;
  const agentId = agentIdFromSession(sessionKey);
  const agent = agents.get(agentId);
  const message = String(p.message ?? "").trim();
  const runId = typeof p.idempotencyKey === "string" && p.idempotencyKey ? p.idempotencyKey : randomUUID();
  if (!agent) return resErr(id, "not_found", "Agent nggak ketemu.");
  if (!message) return resOk(id, { status: "no-op", runId });

  const chat = loadChat(agentId);
  chat.messages.push({ role: "user", content: message, ts: Date.now() });
  // model agent diganti -> mulai sesi Hermes baru supaya model baru langsung dipakai
  if (chat.hermesSessionId && (chat.model || "") !== (agent.model || "")) chat.hermesSessionId = null;
  chat.model = agent.model || "";
  saveChat(agentId, chat);

  const controller = new AbortController();
  chatRuns.set(runId, { controller, sessionKey });
  let seq = 0;
  const emit = (state, extra) =>
    broadcast({ type: "event", event: "chat", seq: seq++, payload: { runId, sessionKey, state, ...extra } });

  setImmediate(async () => {
    broadcast({
      type: "event",
      event: "agent",
      payload: { runId, sessionKey, stream: "lifecycle", data: { phase: "start" }, ts: Date.now() },
    });
    broadcast({
      type: "event",
      event: "office.thinking",
      payload: { agentId, name: agent.name, text: "💭 lagi mikir…", atMs: Date.now() },
    });
    try {
      // Claude hapus-agent: catatan cuma ditambahkan kalau Fauzy minta hapus ke Arga
      const bolehUsul = agentId === ceoId && MINTA_HAPUS_RE.test(message);
      const withNote = bolehUsul ? `${message}\n\n${hapusNote()}` : message;
      const prompt = chat.hermesSessionId
        ? withNote
        : `${chatPreamble(agent)}\n\nPesan pertama dari Fauzy:\n${withNote}`;
      const out = await runAgentTurn(agent, prompt, {
        sessionId: chat.hermesSessionId,
        signal: controller.signal,
        onText: (t) => emit("delta", { message: { role: "assistant", content: stripUsul(t) } }),
      });
      if (out.aborted) {
        emit("aborted", {});
      } else {
        if (bolehUsul) catatUsulHapus(out.text, message);
        out.text = stripUsul(out.text) || "Oke.";
        const fresh = loadChat(agentId);
        fresh.hermesSessionId = out.sessionId || fresh.hermesSessionId;
        fresh.model = agent.model || "";
        fresh.messages.push({ role: "assistant", content: out.text, ts: Date.now() });
        saveChat(agentId, fresh);
        emit("final", { stopReason: "end_turn", message: { role: "assistant", content: out.text } });
        broadcast({
          type: "event",
          event: "office.speech",
          payload: {
            agentId,
            name: agent.name,
            text: out.text,
            atMs: Date.now(),
          },
        });
      }
    } catch (error) {
      emit("error", { errorMessage: error instanceof Error ? error.message : String(error) });
    } finally {
      chatRuns.delete(runId);
      broadcast({
        type: "event",
        event: "agent",
        payload: { runId, sessionKey, stream: "lifecycle", data: { phase: "end" }, ts: Date.now() },
      });
    }
  });
  return resOk(id, { status: "started", runId });
}

// ---------------------------------------------------------------- Jadikan tugas

async function createTaskFromChat(p) {
  const agentId = typeof p.agentId === "string" && agents.has(p.agentId) ? p.agentId : ceoId;
  const agent = agents.get(agentId);
  const title = String(p.title || "").trim().slice(0, 200);
  if (!title) throw new Error("Judul tugas kosong.");
  // v1.5: Fauzy boleh kirim langsung ke agent yang diajak ngobrol (lebih cepat & hemat), atau lewat CEO.
  const wanted = typeof p.assigneeAgentId === "string" && agents.has(p.assigneeAgentId) ? p.assigneeAgentId : null;
  const assignee = p.direct === true && wanted ? wanted : wanted && wanted !== agentId ? wanted : ceoId;
  const direct = assignee !== ceoId;
  const description = [
    String(p.description || "").trim(),
    "",
    `_Dibuat Fauzy dari kantor 3D${agentId !== ceoId ? ` (asal obrolan dengan ${agent.name})` : ""}._`,
    direct
      ? `Dikerjakan LANGSUNG oleh ${agents.get(assignee).name} (tanpa lewat CEO). Kerjakan sampai ada hasil nyata, jangan bikin sub-tugas kecuali benar-benar perlu. Aksi berisiko tetap wajib approval.`
      : "Arga: tugas simpel kerjakan sendiri; kalau butuh staf, delegasi ke SATU agent yang cocok. Aksi berisiko wajib approval.",
  ].join("\n");
  const issue = await pcApi("POST", `/api/companies/${COMPANY_ID}/issues`, {
    title,
    description,
    assigneeAgentId: assignee,
    status: "todo",
  });
  return { issueId: issue.id, identifier: issue.identifier, title: issue.title, assignee: agents.get(assignee)?.name };
}


// ---------------------------------------------------------------- Dialog adegan kantor 3D (brief / lapor)
const sceneCache = new Map();
async function sceneDialog(p) {
  const kind = ["brief_bos", "brief", "lapor", "lapor_bos"].includes(p.kind) ? p.kind : "brief";
  const title = String(p.title || "").trim().slice(0, 200);
  const desc = String(p.description || "").trim().slice(0, 800);
  const key = [kind, p.fromId, p.toId, title].join("|");
  if (sceneCache.has(key)) return sceneCache.get(key);
  const nm = (id) => (id === "__boss__" ? "Pak Fauzy" : agents.get(id)?.name) || "Rekan";
  const jab = (id) => (id === "__boss__" ? "Owner" : agents.get(id)?.title) || "";
  const a = nm(p.fromId), b = nm(p.toId);
  const situasi = {
    brief_bos: `${a} (owner) ngasih tugas ke ${b} (CEO) di ruang bos.`,
    brief: `${a} (CEO) ngasih instruksi tugas ke ${b} (${jab(p.toId)}) di ruang CEO.`,
    lapor: `${a} (${jab(p.fromId)}) lapor tugas selesai ke ${b} (CEO) di ruang CEO.`,
    lapor_bos: `${a} (CEO) lapor ke ${b} (owner) bahwa tugas tim selesai.`,
  }[kind];
  const prompt = [
    "Tulis obrolan singkat di kantor AI DIGITALSTRATEGI untuk animasi kantor 3D.",
    situasi,
    `Tugas: "${title}".${desc ? ` Detail: ${desc}` : ""}`,
    "Aturan: 3-4 baris gantian, tiap baris maks 140 karakter, bahasa Indonesia natural. Ke CEO (Mas Arga) & owner (Pak Fauzy) wajib sopan pakai 'saya'; CEO ke staf boleh santai lu/gue. Sebut inti tugasnya, jangan ngarang angka. Tanpa emoji berlebihan, tanpa markdown.",
    `Balas HANYA JSON: {"lines":[{"who":"A","text":"..."},{"who":"B","text":"..."}]} (A = ${a}, B = ${b}).`,
  ].join("\n");
  const speaker = agents.get(ceoId);
  let lines = null;
  try {
    const out = await runAgentTurn(speaker, prompt, {});
    const raw = out.text;
    const j = JSON.parse((raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)])[1]);
    lines = (j.lines || []).slice(0, 5).map((l) => ({ speakerId: l.who === "B" ? p.toId : p.fromId, name: l.who === "B" ? b : a, text: String(l.text || "").replace(/\*\*/g, "").slice(0, 200) })).filter((l) => l.text);
  } catch {}
  if (!lines || !lines.length) {
    const t = title || "tugas baru";
    lines = kind.startsWith("brief")
      ? [{ speakerId: p.fromId, name: a, text: `${b}, ada tugas: ${t}.` }, { speakerId: p.toId, name: b, text: kind === "brief_bos" ? "Siap Pak Fauzy, saya atur timnya." : "Siap Mas Arga, saya kerjakan." }]
      : [{ speakerId: p.fromId, name: a, text: `${kind === "lapor_bos" ? "Lapor Pak Fauzy" : "Mas Arga"}, ${t} sudah selesai.` }, { speakerId: p.toId, name: b, text: "Mantap, makasih ya." }];
  }
  const res = { kind, title, lines };
  sceneCache.set(key, res);
  if (sceneCache.size > 200) sceneCache.delete(sceneCache.keys().next().value);
  return res;
}

// ---------------------------------------------------------------- Tim & tugas (panel kantor 3D)

const agentName = (id) => (id && agents.get(id)?.name) || null;

async function listIssues(p) {
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 25, 1), 100);
  const { rows } = await pool.query(
    `select i.id, i.identifier, i.title, i.status, i.assignee_agent_id, i.updated_at,
            par.identifier as parent_identifier
       from issues i left join issues par on par.id = i.parent_id
      where i.company_id = $1 and i.hidden_at is null
      order by i.updated_at desc limit $2`,
    [COMPANY_ID, limit],
  );
  return {
    issues: rows.map((r) => ({
      id: r.id,
      identifier: r.identifier,
      title: r.title,
      status: r.status,
      assignee: agentName(r.assignee_agent_id),
      parentIdentifier: r.parent_identifier,
      updatedAt: r.updated_at,
    })),
  };
}

async function getIssue(p) {
  const key = String(p.id || p.identifier || "");
  if (!key) throw new Error("id tugas kosong.");
  const { rows } = await pool.query(
    `select id, identifier, title, description, status, assignee_agent_id, created_at, updated_at
       from issues where company_id = $1 and (id::text = $2 or identifier = $2) limit 1`,
    [COMPANY_ID, key],
  );
  const r = rows[0];
  if (!r) throw new Error("Tugas tidak ketemu.");
  return {
    issue: {
      id: r.id, identifier: r.identifier, title: r.title, description: r.description,
      status: r.status, assignee: agentName(r.assignee_agent_id),
      createdAt: r.created_at, updatedAt: r.updated_at,
    },
  };
}

async function listApprovals() {
  const { rows } = await pool.query(
    `select id, type, status, payload, requested_by_agent_id, created_at
       from approvals where company_id = $1 and status = 'pending'
      order by created_at desc limit 50`,
    [COMPANY_ID],
  );
  return {
    approvals: rows.map((r) => ({
      id: r.id,
      title: (r.payload && (r.payload.title || r.payload.summary)) || r.type,
      requestedBy: agentName(r.requested_by_agent_id),
      createdAt: r.created_at,
      status: r.status,
    })),
  };
}

function lastChat(p) {
  const agentId = typeof p.agentId === "string" && agents.has(p.agentId) ? p.agentId : ceoId;
  const msgs = loadChat(agentId).messages || [];
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const lastAsst = [...msgs].reverse().find((m) => m.role === "assistant");
  return { user: lastUser?.content || "", assistant: lastAsst?.content || "" };
}

// ---------------------------------------------------------------- Model per agent (v1.5.1)
// Daftar model diambil dari endpoint aktif (menu Model AI atau 9Router lokal) lewat tools/model_ai.py.
const MODEL_PROVIDER = "kantor";
const MODEL_TOOL = "/opt/data/kantor/tools/model_ai.py";
let modelCache = { at: 0, list: [] };
function runModelTool(cmd, input) {
  return new Promise((resolve) => {
    const ch = spawn("/opt/hermes/.venv/bin/python", [MODEL_TOOL, cmd], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    const t = setTimeout(() => ch.kill("SIGKILL"), 60000);
    ch.stdout.on("data", (d) => (out += d));
    ch.on("close", () => {
      clearTimeout(t);
      try { resolve(JSON.parse(out.trim().split("\n").pop())); } catch { resolve({ ok: false, error: "tool model error" }); }
    });
    ch.stdin.end(input ? JSON.stringify(input) : "");
  });
}
async function listModels() {
  if (Date.now() - modelCache.at < 60000 && modelCache.list.length) return modelCache.list;
  const r = await runModelTool("models");
  const list = r && r.ok && Array.isArray(r.models) ? r.models : [];
  const mine = [...agents.values()].map((a) => a.model).filter(Boolean);
  modelCache = { at: Date.now(), list: [...new Set([...list, ...mine])] };
  return modelCache.list;
}

// ---------------------------------------------------------------- Protocol helpers

function resOk(id, payload) {
  return { type: "res", id, ok: true, payload: payload ?? {} };
}
function resErr(id, code, message) {
  return { type: "res", id, ok: false, error: { code, message } };
}

const meeting = require("./meeting");

async function handleMethod(method, params, id, sendEvent) {
  const p = params || {};
  switch (method) {
    case "agents.list":
      return resOk(id, { defaultId: ceoId, mainKey: MAIN_KEY, agents: agentListPayload() });
    case "agents.create":
    case "agents.update":
    case "agents.delete":
      return resErr(id, "unsupported_method", "Rekrut/ubah agent lewat Arga (CEO) supaya lewat approval.");
    case "agents.files.get":
      return resOk(id, { file: { missing: true } });
    case "agents.files.set":
      return resErr(id, "unsupported_method", "Instruksi agent diatur lewat Paperclip.");
    case "config.get":
      return resOk(id, { config: { gateway: { reload: { mode: "hot" } } }, hash: "kantor", exists: true, path: "" });
    case "config.patch":
    case "config.set":
      return resOk(id, { hash: "kantor" });
    case "exec.approvals.get":
      return resOk(id, {
        path: "",
        exists: true,
        hash: "kantor",
        file: { version: 1, defaults: { security: "full", ask: "off", autoAllowSkills: false }, agents: {} },
      });
    case "exec.approvals.set":
      return resOk(id, { hash: "kantor" });
    case "exec.approval.resolve":
      return resOk(id, { ok: true });
    case "models.list":
      return resOk(id, { models: (await listModels()).map((m) => ({ id: m, name: m, provider: MODEL_PROVIDER })) });
    case "skills.status":
      return resOk(id, { skills: [] });
    case "cron.list":
      return resOk(id, { jobs: [] });
    case "cron.add":
    case "cron.run":
    case "cron.remove":
      return resErr(id, "unsupported_method", "Rutinitas diatur lewat Paperclip.");
    case "sessions.list":
      return resOk(id, {
        sessions: [...agents.values()].map((a) => {
          const chat = loadChat(a.id);
          const last = chat.messages[chat.messages.length - 1];
          return {
            key: `agent:${a.id}:${MAIN_KEY}`,
            agentId: a.id,
            updatedAt: last ? last.ts : null,
            displayName: "Chat",
            origin: { label: a.name, provider: "paperclip" },
            model: a.model || "",
            modelProvider: MODEL_PROVIDER,
          };
        }),
      });
    case "sessions.preview": {
      const keys = Array.isArray(p.keys) ? p.keys : [];
      const limit = typeof p.limit === "number" ? p.limit : 8;
      const maxChars = typeof p.maxChars === "number" ? p.maxChars : 240;
      return resOk(id, {
        ts: Date.now(),
        previews: keys.map((key) => {
          const chat = loadChat(agentIdFromSession(key));
          if (!chat.messages.length) return { key, status: "empty", items: [] };
          return {
            key,
            status: "ok",
            items: chat.messages.slice(-limit).map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              text: String(m.content || "").slice(0, maxChars),
              timestamp: m.ts || Date.now(),
            })),
          };
        }),
      });
    }
    case "sessions.patch": {
      const agent = agents.get(agentIdFromSession(p.key));
      if (agent && typeof p.model === "string" && p.model.trim()) {
        const m = p.model.trim().replace(new RegExp("^" + MODEL_PROVIDER + "/"), "");
        if (m !== agent.model) {
          const r = await runModelTool("agent_model", { agent_id: agent.id, model: m, skip_test: true });
          if (!r.ok) return resErr(id, "model_failed", r.error || "Gagal ganti model.");
          agent.model = m;
        }
      }
      return resOk(id, {
        ok: true,
        key: p.key,
        entry: {},
        resolved: { model: agent?.model || "", modelProvider: MODEL_PROVIDER },
      });
    }
    case "sessions.reset": {
      const agentId = agentIdFromSession(p.key);
      saveChat(agentId, { hermesSessionId: null, messages: [] });
      return resOk(id, { ok: true });
    }
    case "chat.send":
      return handleChatSend(p, id, sendEvent);
    case "chat.abort": {
      let aborted = 0;
      for (const [runId, run] of chatRuns) {
        if ((p.runId && p.runId === runId) || (!p.runId && p.sessionKey === run.sessionKey)) {
          run.controller.abort();
          aborted += 1;
        }
      }
      return resOk(id, { ok: true, aborted });
    }
    case "chat.history": {
      const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey : `agent:${ceoId}:${MAIN_KEY}`;
      const chat = loadChat(agentIdFromSession(sessionKey));
      return resOk(id, {
        sessionKey,
        messages: chat.messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.ts })),
      });
    }
    case "agent.wait": {
      const runId = typeof p.runId === "string" ? p.runId : "";
      const timeoutMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 30000;
      const start = Date.now();
      while (chatRuns.has(runId) && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 200));
      return resOk(id, { status: chatRuns.has(runId) ? "running" : "done" });
    }
    case "status":
      return resOk(id, { sessions: { recent: [], byAgent: [...agents.keys()].map((agentId) => ({ agentId, recent: [] })) } });
    case "wake":
      return resOk(id, { ok: true });

    // --- Kantor AI ---
    case "kantor.overview":
      return resOk(id, {
        agents: [...agents.values()].map((a) => ({
          id: a.id,
          name: a.name,
          title: a.title,
          role: a.role,
          reportsTo: a.reportsTo,
          paperclipStatus: a.paperclipStatus,
          working: activeRuns.has(a.id),
          currentIssue: activeRuns.get(a.id)?.issue ?? null,
          chatFromBoss: !!activeRuns.get(a.id)?.fromBoss,
        })),
        ceoId,
      });
    case "kantor.agent.hapus.list":
      return resOk(id, daftarUsul());
    case "kantor.agent.hapus.setujui":
      return resOk(id, await jawabUsul(p, true));
    case "kantor.agent.hapus.tolak":
      return resOk(id, await jawabUsul(p, false));
    case "kantor.task.create":
      return resOk(id, await createTaskFromChat(p));
    case "kantor.chat.last":
      return resOk(id, lastChat(p));
    case "kantor.issues":
      return resOk(id, await listIssues(p));
    case "kantor.issue":
      return resOk(id, await getIssue(p));
    case "kantor.approvals":
      return resOk(id, await listApprovals());
    case "kantor.meeting.start":
      return resOk(id, meeting.start(p, { agents, ceoId, runAgentTurn, broadcast, createTask: createTaskFromChat }));
    case "kantor.meeting.get":
      return resOk(id, meeting.get());
    case "kantor.meeting.stop":
      return resOk(id, meeting.stop());
    case "kantor.scene.dialog":
      return resOk(id, await sceneDialog(p));
    case "kantor.meeting.continue":
      return resOk(id, meeting.lanjut());
    case "kantor.meeting.pause":
      return resOk(id, meeting.pause());
    case "kantor.meeting.resume":
      return resOk(id, meeting.resume());
    case "kantor.meeting.say":
      return resOk(id, meeting.say(p));
    case "kantor.meeting.tasks":
      return resOk(id, await meeting.createTasks(p, { createTask: createTaskFromChat }));
    default:
      return resOk(id, {});
  }
}

const METHODS = [
  "agents.list", "sessions.list", "sessions.preview", "sessions.patch", "sessions.reset",
  "chat.send", "chat.abort", "chat.history", "agent.wait", "status", "config.get", "config.set",
  "config.patch", "agents.files.get", "exec.approvals.get", "exec.approvals.set",
  "exec.approval.resolve", "wake", "skills.status", "models.list", "cron.list",
  "kantor.overview", "kantor.task.create", "kantor.meeting.start", "kantor.meeting.get",
  "kantor.meeting.stop", "kantor.meeting.tasks", "kantor.meeting.pause", "kantor.meeting.resume", "kantor.meeting.say", "kantor.meeting.continue", "kantor.scene.dialog",
  "kantor.agent.hapus.list", "kantor.agent.hapus.setujui", "kantor.agent.hapus.tolak",
  "kantor.chat.last", "kantor.issues", "kantor.issue", "kantor.approvals",
];

function start() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Kantor AI gateway adapter (Paperclip)\n");
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    let connected = false;
    let seq = 0;
    const send = (frame) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
    };
    const sink = (frame) => {
      if (!connected) return;
      if (frame.type === "event") frame = { ...frame, seq: seq++ };
      send(frame);
    };
    sinks.add(sink);
    send({ type: "event", event: "connect.challenge", payload: { nonce: randomUUID().replace(/-/g, "") } });
    ws.on("message", async (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }
      if (!frame || frame.type !== "req" || typeof frame.id !== "string") return;
      const { id, method, params } = frame;
      if (method === "connect") {
        connected = true;
        send({
          type: "res",
          id,
          ok: true,
          payload: {
            type: "hello-ok",
            protocol: 3,
            adapterType: "custom",
            features: { methods: METHODS, events: ["chat", "presence", "heartbeat", "agent", "kantor.meeting"] },
            snapshot: {
              health: {
                agents: [...agents.values()].map((a) => ({ agentId: a.id, name: a.name, isDefault: a.id === ceoId })),
                defaultAgentId: ceoId,
              },
              sessionDefaults: { mainKey: MAIN_KEY },
            },
            auth: { role: "operator", scopes: ["operator.admin"] },
            policy: { tickIntervalMs: 30000 },
          },
        });
        // Agent yang lagi kerja di Paperclip langsung kelihatan kerja.
        for (const [agentId, run] of activeRuns) {
          sink({
            type: "event",
            event: "agent",
            payload: { runId: `pc-${run.runId}`, sessionKey: `agent:${agentId}:${MAIN_KEY}`, stream: "lifecycle", data: { phase: "start" }, ts: Date.now() },
          });
        }
        return;
      }
      if (!connected) return send(resErr(id, "not_connected", "Send connect first."));
      try {
        send(await handleMethod(method, params, id, sink));
      } catch (error) {
        send(resErr(id, "internal_error", error instanceof Error ? error.message : "Internal error"));
      }
    });
    const drop = () => sinks.delete(sink);
    ws.on("close", drop);
    ws.on("error", drop);
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`[kantor-adapter] ws://127.0.0.1:${PORT}`));
}

async function loop() {
  try {
    await refreshAgents();
    await pollRuns();
  } catch (error) {
    console.error("[kantor-adapter] poll error", error.message);
  }
  setTimeout(loop, 4000);
}

refreshAgents()
  .then(() => {
    start();
    loop();
  })
  .catch((error) => {
    console.error("[kantor-adapter] gagal start", error);
    process.exit(1);
  });
