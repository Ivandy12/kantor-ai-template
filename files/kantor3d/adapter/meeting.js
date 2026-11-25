"use strict";
/*
 * Rapat & debat antar agent.
 * Gantian ngomong: tiap agent baca transkrip sebelumnya dulu baru jawab.
 * Arga (CEO) jadi moderator / juri dan nulis notulen. Action item TIDAK otomatis
 * dieksekusi: Fauzy pilih dulu, lalu jadi tugas Paperclip lewat CEO (jalur eskalasi tetap).
 */

const { randomUUID } = require("crypto");

let current = null;
let history = [];
let abort = null;

const STANCE_LABEL = { pro: "PRO", kontra: "KONTRA", celah: "PENCARI CELAH" };

function snapshot() {
  return current ? JSON.parse(JSON.stringify(current)) : null;
}

function get() {
  return { meeting: snapshot(), recent: history.slice(-5).map((m) => ({ id: m.id, topic: m.topic, mode: m.mode, endedAt: m.endedAt })) };
}

function stop() {
  if (current && (current.phase === "berjalan" || current.phase === "notulen")) {
    abort?.abort();
    const last = current.transcript[current.transcript.length - 1];
    if (last && last.live) current.transcript.pop();
    current.phase = "dihentikan";
    current.speakingAgentId = null;
    current.endedAt = Date.now();
  }
  return get();
}

function transcriptText(m) {
  if (!m.transcript.length) return "(belum ada yang bicara)";
  return m.transcript
    .map((t) => `${t.name}${t.stance ? ` [${STANCE_LABEL[t.stance]}]` : ""}: ${t.text}`)
    .join("\n\n");
}

/** Buang format laporan (markdown) supaya kebaca kayak omongan. */
function bersihkan(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function personaLine(a) {
  return `Kamu ${a.name}, ${a.title} di kantor AI DIGITALSTRATEGI (owner: Pak Fauzy).`;
}

/** Pause & pesan dari Pak Fauzy. */
async function waitIfPaused(m, signal) {
  while (m.paused) {
    if (signal.aborted) throw new Error("dihentikan");
    await new Promise((r) => setTimeout(r, 400));
  }
  if (signal.aborted) throw new Error("dihentikan");
}
function userNote(m) {
  if (!m.pendingUser) return "";
  const t = m.pendingUser;
  m.pendingUser = null;
  return `\nPENTING: Pak Fauzy (owner) barusan ikut ngomong: "${t}". Tanggapi omongan Pak Fauzy dulu dengan sopan (panggil 'Pak Fauzy'), baru lanjut poinmu.`;
}
function pause() {
  if (current && current.phase === "berjalan") current.paused = true;
  return get();
}
function resume() {
  if (current) current.paused = false;
  return get();
}
function say(params) {
  const text = String(params.text || "").trim().slice(0, 800);
  if (!text) throw new Error("Pesan kosong.");
  if (!current || !["berjalan", "notulen", "dihentikan", "gagal"].includes(current.phase)) throw new Error("Nggak ada rapat yang lagi jalan.");
  const berhenti = ["dihentikan", "gagal"].includes(current.phase);
  current.transcript.push({ agentId: "__boss__", name: "Pak Fauzy", stance: null, round: current.round, text, ts: Date.now(), live: false, kind: "user" });
  current.pendingUser = current.pendingUser ? current.pendingUser + " / " + text : text;
  current.paused = false;
  if (berhenti && !current.notulen) return lanjut();
  return get();
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function start(params, ctx) {
  if (current && (current.phase === "berjalan" || current.phase === "notulen")) {
    throw new Error("Masih ada rapat yang jalan. Hentikan dulu.");
  }
  const topic = String(params.topic || "").trim().slice(0, 500);
  if (!topic) throw new Error("Topik rapat kosong.");
  const mode = params.mode === "debat" ? "debat" : "diskusi";
  const ids = (Array.isArray(params.participantIds) ? params.participantIds : [])
    .filter((id) => ctx.agents.has(id) && id !== ctx.ceoId)
    .slice(0, 15);
  if (ids.length < (mode === "debat" ? 2 : 1)) {
    throw new Error(mode === "debat" ? "Debat butuh minimal 2 peserta selain Arga." : "Pilih minimal 1 peserta.");
  }
  const rounds = Math.max(1, Math.min(3, parseInt(params.rounds, 10) || (mode === "debat" ? 3 : 2)));
  const stances = {};
  if (mode !== "debat") {
    const given = params.stances && typeof params.stances === "object" ? params.stances : {};
    ids.forEach((id) => { if (["pro", "kontra", "celah"].includes(given[id])) stances[id] = given[id]; });
  }
  if (mode === "debat") {
    const given = params.stances && typeof params.stances === "object" ? params.stances : {};
    ids.forEach((id, i) => {
      stances[id] = ["pro", "kontra", "celah"].includes(given[id]) ? given[id] : i === 0 ? "pro" : i === 1 ? "kontra" : "celah";
    });
  }
  const ceo = ctx.agents.get(ctx.ceoId);
  current = {
    id: randomUUID(),
    topic,
    mode,
    rounds,
    round: 0,
    moderatorId: ctx.ceoId,
    participants: [ctx.ceoId, ...ids].map((id) => {
      const a = ctx.agents.get(id);
      return { id, name: a.name, title: a.title, stance: stances[id] || (id === ctx.ceoId ? (mode === "debat" ? "juri" : "moderator") : null) };
    }),
    phase: "berjalan",
    paused: false,
    pendingUser: null,
    speakingAgentId: null,
    transcript: [],
    notulen: null,
    error: null,
    tasksCreated: [],
    startedAt: Date.now(),
    endedAt: null,
    moderatorName: ceo.name,
  };
  current.stances = stances;
  jalankan(current, ctx);
  return get();
}

async function speak(m, ctx, signal, agentId, prompt, stance) {
  await waitIfPaused(m, signal);
  prompt += userNote(m);
  const agent = ctx.agents.get(agentId);
  m.speakingAgentId = agentId;
  const entry = { agentId, name: agent.name, stance: stance || null, round: m.round, text: "", ts: Date.now(), live: true };
  m.transcript.push(entry);
  const out = await ctx.runAgentTurn(agent, prompt, {
    signal,
    onText: (t) => {
      entry.text = t.slice(0, 1500);
    },
  });
  if (signal.aborted || out.aborted) {
    const k = m.transcript.indexOf(entry);
    if (k >= 0 && m.transcript[k].live) m.transcript.splice(k, 1);
    throw new Error("dihentikan");
  }
  let teks = bersihkan(out.text);
  if (m.transcript.length > 1) teks = teks.replace(/^(selamat\s+)?(pagi|siang|sore|malam|halo|hai)\b[^.!?\n]*[.!?]\s*/i, "").replace(/^izin\s+(masuk|menanggapi|nambahin|ya)?[^,.!?]{0,30}[,.]\s*/i, "");
  entry.text = (teks || bersihkan(out.text)).slice(0, 1500);
  entry.live = false;
  m.speakingAgentId = null;
  return out.text;
}

const GAYA_GILIRAN = [
  "nyeletuk singkat 1 kalimat aja, kayak bales chat grup",
  "tanggapin SATU orang spesifik (sebut namanya), setuju atau bantah",
  "kasih ide konkret dari sisi divisimu, boleh 2-3 kalimat",
  "nanya balik yang tajam ke orang yang omongannya paling ngambang",
  "nggak setuju dengan tegas + alasan singkat",
  "tambahin hal yang belum kepikiran sama yang lain",
];
const PANJANG = ["1 kalimat pendek", "1-2 kalimat", "2-3 kalimat", "1 kalimat", "2 kalimat"];
const acak = (arr) => arr[Math.floor(Math.random() * arr.length)];

function rulesText() {
  return [
    "GAYA NGOMONG (wajib):",
    "- Ini grup chat kerja beneran, bukan laporan. Ngomong kayak manusia: chill, spontan, tapi kritis dan sopan.",
    "- JANGAN buka dengan salam (Pagi/Halo/Izin Mas Arga) — salam cuma sekali di awal rapat. JANGAN pakai template 'Saya setuju dengan syarat…' atau 'risikonya kalau…' tiap giliran.",
    "- Satu pesan = satu gaya bahasa, jangan dicampur: kalau pesanmu ditujukan ke Mas Arga / Pak Fauzy pakai 'saya' dan sopan; kalau ke rekan pakai 'gue/lu' santai.",
    "- Jangan ngulang omongan orang lain. Jangan selalu lempar pertanyaan; kalau nanya, ke orang yang relevan, jangan ke orang yang sama terus.",
    "- Tanpa bullet, heading, bold, atau markdown. Emoji maksimal 1 dan jarang.",
    "- Jangan ngarang angka/data; kalau belum ada, bilang perlu dicek. Jangan pakai tool.",
  ].join("\n");
}

function pickNext(m, remaining) {
  const lastTwo = m.transcript.slice(-2).map((t) => t.text.toLowerCase()).join(" ");
  const disebut = remaining.filter((p) => {
    const n = p.name.toLowerCase().replace(/^am\s+/, "");
    return new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lastTwo);
  });
  if (disebut.length) return disebut[0];
  return remaining[Math.floor(Math.random() * remaining.length)];
}

async function run(m, ctx, signal) {
  const ceo = ctx.agents.get(ctx.ceoId);
  const others = m.participants.filter((p) => p.id !== ctx.ceoId);
  const stances = m.stances || {};
  const peserta = others.map((p) => `${p.name} (${p.title}${p.stance && STANCE_LABEL[p.stance] ? `, ${STANCE_LABEL[p.stance]}` : ""})`).join(", ");
  const rules = rulesText();
  m.spoken = m.spoken || {};

  if (!m.opened) {
    m.round = 0;
    await speak(
      m, ctx, signal, ctx.ceoId,
      [
        personaLine(ceo),
        m.mode === "debat"
          ? `Kamu jadi JURI debat. Mosi: "${m.topic}". Peserta: ${peserta}.`
          : `Kamu memimpin rapat. Topik dari Pak Fauzy: "${m.topic}". Peserta: ${peserta}.`,
        "Buka rapat dengan santai kayak bos yang akrab (2-3 kalimat): sapa tim sekali aja, jelasin topiknya, bilang semua bebas setuju atau bantah dan nanti kamu yang kasih putusan, lalu tunjuk satu orang yang paling relevan buat mulai (sebut namanya).",
        rules,
      ].join("\n"),
      m.mode === "debat" ? "juri" : "moderator",
    );
    m.opened = true;
    m.round = 1;
  }

  for (let r = Math.max(1, m.round || 1); r <= m.rounds; r += 1) {
    m.round = r;
    m.spoken[r] = m.spoken[r] || [];
    if (r > 1 && !m.spoken[r].includes(ctx.ceoId)) {
      await speak(
        m, ctx, signal, ctx.ceoId,
        [
          personaLine(ceo),
          `Kamu memimpin rapat soal "${m.topic}".`,
          "Transkrip sejauh ini:",
          transcriptText(m),
          "",
          "Nyela sebentar (1-2 kalimat): bilang singkat apa yang udah nyambung dan di mana yang masih beda pendapat, lalu lempar pertanyaan tajam ke satu orang (sebut nama).",
          rules,
        ].join("\n"),
        m.mode === "debat" ? "juri" : "moderator",
      );
      m.spoken[r].push(ctx.ceoId);
    }
    for (;;) {
      const remaining = others.filter((p) => !m.spoken[r].includes(p.id));
      if (!remaining.length) break;
      const p = pickNext(m, remaining);
      const agent = ctx.agents.get(p.id);
      const stance = stances[p.id] || null;
      const posisi =
        stance === "pro" ? "Posisimu: PRO (mendukung). Bela posisi ini." :
        stance === "kontra" ? "Posisimu: KONTRA (menolak). Bela posisi ini." :
        stance === "celah" ? "Posisimu: PENCARI CELAH — cari kelemahan ide siapa pun, jangan memihak." :
        "Posisimu bebas: boleh setuju, nggak setuju, atau setengah-setengah — jujur aja.";
      const tahap = r === 1
        ? `Ini giliran pertamamu. Pandangan dari sisi divisimu (${agent.title}).`
        : r === m.rounds
          ? "Ini putaran terakhir: tegasin posisi akhirmu dan sebut bagian kerjamu + kapan bisa beres."
          : "Tanggapi omongan yang paling menarik atau paling lemah di atas.";
      await speak(
        m, ctx, signal, p.id,
        [
          personaLine(agent),
          `Rapat dipimpin Mas ${ceo.name}. Topik: "${m.topic}". Putaran ${r} dari ${m.rounds}.`,
          "",
          "Transkrip sejauh ini:",
          transcriptText(m),
          "",
          posisi,
          tahap,
          `Cara kamu ngomong kali ini: ${acak(GAYA_GILIRAN)}. Panjang: ${acak(PANJANG)}.`,
          rules,
        ].join("\n"),
        stance,
      );
      m.spoken[r].push(p.id);
    }
  }

  if (!m.closed) {
    await speak(
      m, ctx, signal, ctx.ceoId,
      [
        personaLine(ceo),
        `Rapat soal "${m.topic}" mau ditutup.`,
        "Transkrip:",
        transcriptText(m),
        "",
        "Tutup santai (1-2 kalimat): makasih ke tim, sebut kesimpulan intinya, bilang putusan + pembagian tugas kamu tulis buat Pak Fauzy.",
        rules,
      ].join("\n"),
      m.mode === "debat" ? "juri" : "moderator",
    );
    m.closed = true;
  }

  m.phase = "notulen";
  m.round = m.rounds + 1;
  const schema = `{"putusan": "keputusan akhir kamu atas hal yang diperdebatkan (atau 'semua sepakat: ...')", "alasan": "2-3 kalimat kenapa", "argumenPro": "pendapat terkuat yang mendukung (sebut siapa)", "argumenKontra": "pendapat terkuat yang menolak / ragu (sebut siapa)", "celah": "kelemahan / celah yang ketemu", "keputusan": ["..."], "risiko": ["..."], "rekomendasi": "...", "actionItems": [{"siapa": "nama agent", "apa": "...", "kapan": "..."}]}`;
  const notulenText = await speak(
    m, ctx, signal, ctx.ceoId,
    [
      personaLine(ceo),
      `Rapat selesai. Topik: "${m.topic}". Kamu moderator sekaligus juri: nilai argumen yang paling kuat, kasih putusan + alasan, lalu tulis notulen. Keputusan akhir tetap di Pak Fauzy.`,
      "",
      "Transkrip lengkap:",
      transcriptText(m),
      "",
      `Balas HANYA dengan JSON valid persis format ini (bahasa Indonesia, singkat):\n${schema}`,
      "Action item hanya yang benar-benar disepakati, siapa = nama agent peserta yang paling cocok mengerjakan. Jangan pakai tool.",
    ].join("\n"),
    m.mode === "debat" ? "juri" : null,
  );
  const parsed = extractJson(notulenText);
  const last = m.transcript[m.transcript.length - 1];
  last.kind = "notulen";
  if (parsed) {
    m.notulen = parsed;
    last.text = `Putusan: ${parsed.putusan || "-"}. ${parsed.alasan || ""}`;
  } else {
    m.notulen = { raw: notulenText };
  }
  m.phase = "selesai";
  m.speakingAgentId = null;
  m.endedAt = Date.now();
  history.push(snapshot());
  history = history.slice(-10);
}

let lastCtx = null;
function jalankan(m, ctx) {
  lastCtx = ctx;
  abort?.abort();
  abort = new AbortController();
  const signal = abort.signal;
  m.runSeq = (m.runSeq || 0) + 1;
  const seq = m.runSeq;
  run(m, ctx, signal).catch((error) => {
    if (!current || current.id !== m.id || current.runSeq !== seq) return;
    if (signal.aborted) {
      current.phase = "dihentikan";
    } else {
      current.error = error instanceof Error ? error.message : String(error);
      current.phase = "gagal";
    }
    current.speakingAgentId = null;
    current.endedAt = Date.now();
  });
}

function lanjut() {
  if (!current || !["dihentikan", "gagal"].includes(current.phase)) throw new Error("Nggak ada rapat yang bisa dilanjut.");
  if (!lastCtx) throw new Error("Adapter baru restart, rapat lama nggak bisa dilanjut. Mulai rapat baru ya.");
  const last = current.transcript[current.transcript.length - 1];
  if (last && last.live) current.transcript.pop();
  current.phase = current.notulen ? "selesai" : "berjalan";
  current.error = null;
  current.endedAt = null;
  current.paused = false;
  if (current.phase === "berjalan") jalankan(current, lastCtx);
  return get();
}

async function createTasks(params, { createTask }) {
  if (!current || !current.notulen || !Array.isArray(current.notulen.actionItems)) {
    throw new Error("Belum ada action item.");
  }
  const picks = Array.isArray(params.indexes) ? params.indexes : current.notulen.actionItems.map((_, i) => i);
  const created = [];
  for (const i of picks) {
    const item = current.notulen.actionItems[i];
    if (!item || current.tasksCreated.includes(i)) continue;
    const pick = params.assignees && params.assignees[i];
    const byName = item.siapa ? current.participants.find((p) => p.name.toLowerCase() === String(item.siapa).toLowerCase() || String(item.siapa).toLowerCase().includes(p.name.toLowerCase())) : null;
    const assigneeAgentId = (typeof pick === "string" && pick) || (byName && byName.id) || null;
    const task = await createTask({
      assigneeAgentId,
      notulen: current.notulen,
      title: `${item.apa}`.slice(0, 180),
      description: [
        `Dari ${current.mode} "${current.topic}".`,
        `Usulan pelaksana: ${item.siapa || "-"}${item.kapan ? `, target ${item.kapan}` : ""}.`,
        assigneeAgentId ? "Disetujui Pak Fauzy dari rapat — langsung kerjakan." : "Arga: delegasikan ke agent yang tepat sesuai jalur biasa.",
        "",
        "Ringkasan rapat: " + JSON.stringify(current.notulen).slice(0, 1500),
      ].join("\n"),
    });
    current.tasksCreated.push(i);
    created.push(task);
  }
  return { created, meeting: snapshot() };
}

module.exports = { start, stop, get, createTasks, pause, resume, say, lanjut };
