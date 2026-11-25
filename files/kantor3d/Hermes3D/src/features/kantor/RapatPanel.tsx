"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { kantorCall, type KantorAgent } from "@/features/kantor/kantorApi";
import type { KantorMeeting } from "@/lib/kantor/meetingSync";

type Mode = "diskusi" | "debat";
// Claude rapat-semua: batas peserta = batas backend (adapter/meeting.js slice(0, 15)); dulu 6
const MAX_PESERTA = 15;
type Stance = "pro" | "kontra" | "celah";

const STANCE_TEXT: Record<string, string> = {
  pro: "PRO",
  kontra: "KONTRA",
  celah: "PENCARI CELAH",
  juri: "JURI",
  moderator: "MODERATOR",
};
const STANCE_COLOR: Record<string, string> = {
  pro: "text-teal-300",
  kontra: "text-pink-300",
  celah: "text-amber-300",
  juri: "text-violet-300",
  moderator: "text-violet-300",
};

const PHASE_TEXT: Record<string, string> = {
  berjalan: "Rapat berjalan",
  notulen: "Arga lagi nyusun notulen…",
  selesai: "Selesai",
  dihentikan: "Dihentikan",
  gagal: "Gagal",
};

type ActionItem = { siapa?: string; apa?: string; kapan?: string };

export function RapatPanel({ open, onClose, agents }: { open: boolean; onClose: () => void; agents: KantorAgent[] }) {
  const [meeting, setMeeting] = useState<KantorMeeting | null>(null);
  const [mode, setMode] = useState<Mode>("diskusi");
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(2);
  const [picked, setPicked] = useState<string[]>([]);
  const [stances, setStances] = useState<Record<string, Stance>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [sela, setSela] = useState(""); // Claude rapat-ai
  const scrollRef = useRef<HTMLDivElement>(null);

  const ceo = agents.find((a) => a.role === "ceo");
  const candidates = useMemo(() => agents.filter((a) => a.role !== "ceo"), [agents]);
  const running = meeting?.phase === "berjalan" || meeting?.phase === "notulen";

  const refresh = useCallback(async () => {
    try {
      const out = await kantorCall<{ meeting: KantorMeeting | null }>("kantor.meeting.get");
      setMeeting(out.meeting);
    } catch {
      /* diam */
    }
  }, []);

  useEffect(() => {
    // Claude rapat-ai: panel ditutup pun tetap memantau, supaya gerak & bubble di 3D ikut rapat
    void refresh();
    const id = window.setInterval(() => void refresh(), open ? 2000 : 5000);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [meeting?.transcript.length, meeting?.transcript[meeting.transcript.length - 1]?.text]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_PESERTA ? prev : [...prev, id]));

  const defaultStance = (id: string): Stance => {
    const i = picked.indexOf(id);
    return i === 0 ? "pro" : i === 1 ? "kontra" : "celah";
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    setTaskMsg(null);
    try {
      const out = await kantorCall<{ meeting: KantorMeeting }>("kantor.meeting.start", {
        topic,
        mode,
        rounds,
        participantIds: picked,
        stances: mode === "debat" ? Object.fromEntries(picked.map((id) => [id, stances[id] ?? defaultStance(id)])) : {},
      });
      setMeeting(out.meeting);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mulai rapat.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    const out = await kantorCall<{ meeting: KantorMeeting }>("kantor.meeting.stop").catch(() => null);
    if (out) setMeeting(out.meeting);
  };

  const kirimSela = async () => {
    const text = sela.trim();
    if (!text) return;
    setSela("");
    try {
      const out = await kantorCall<{ meeting: KantorMeeting }>("kantor.meeting.say", { text });
      setMeeting(out.meeting);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal kirim.");
    }
  };

  const makeTasks = async (indexes?: number[]) => {
    setBusy(true);
    setTaskMsg(null);
    try {
      const out = await kantorCall<{ created: { identifier: string }[]; meeting: KantorMeeting }>("kantor.meeting.tasks", {
        indexes,
      });
      setMeeting(out.meeting);
      setTaskMsg(
        out.created.length
          ? `${out.created.map((c) => c.identifier).join(", ")} masuk ke Arga. Approval tetap lewat Telegram.`
          : "Semua action item sudah jadi tugas.",
      );
    } catch (e) {
      setTaskMsg(e instanceof Error ? e.message : "Gagal bikin tugas.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const notulen = (meeting?.notulen ?? null) as Record<string, unknown> | null;
  const actionItems = (Array.isArray(notulen?.actionItems) ? notulen?.actionItems : []) as ActionItem[];
  const showForm = !meeting || !running;

  return (
    <div className="pointer-events-none fixed inset-0 z-[150] flex items-stretch justify-end" role="dialog" aria-label="Rapat dan debat">
      <div className="pointer-events-auto flex h-full w-full max-w-[560px] flex-col border-l border-violet-500/30 bg-[#0D0A14]/95 text-[#F1EEF9] shadow-2xl backdrop-blur">
        <header className="flex items-center justify-between gap-3 border-b border-[#2D2548] px-5 py-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-violet-300">Ruang rapat</div>
            <h2 className="text-xl font-extrabold">{meeting && running ? meeting.topic : "Rapat & debat"}</h2>
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button type="button" onClick={() => void stop()} className="rounded-lg border border-[#2D2548] px-3 py-2 text-sm font-semibold">
                Hentikan
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="rounded-lg bg-[#201936] px-3 py-2 text-sm font-semibold" aria-label="Tutup">
              Tutup
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {showForm ? (
            <section className="rounded-2xl border border-[#2D2548] bg-[#17122A] p-4">
              <div className="flex flex-wrap items-center gap-2">
                {(["diskusi", "debat"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setRounds(m === "debat" ? 3 : 2);
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === m ? "bg-violet-600 text-white" : "bg-[#201936] text-[#A9A1C4]"}`}
                  >
                    {m === "diskusi" ? "Diskusi" : "Debat"}
                  </button>
                ))}
                <span className="text-xs text-[#A9A1C4]">
                  {mode === "diskusi"
                    ? "Tiap divisi kasih pandangan, Arga nulis notulen."
                    : "Pro vs kontra + pencari celah, Arga jadi juri."}
                </span>
              </div>
              <label htmlFor="rapat-topic" className="mt-4 block text-xs font-semibold text-[#A9A1C4]">
                {mode === "debat" ? "Mosi debat" : "Topik rapat"}
              </label>
              <textarea
                id="rapat-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                placeholder={mode === "debat" ? "Misal: ebook dijual murah 49rb lebih baik daripada premium 149rb" : "Misal: launching ebook Meta Ads dalam 7 hari"}
                className="mt-1 w-full rounded-lg border border-[#2D2548] bg-[#201936] px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
              <div className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold text-[#A9A1C4]">
                <span>
                  Peserta {picked.length}/{Math.min(MAX_PESERTA, candidates.length)} · {ceo?.name ?? "Arga"} otomatis ikut sebagai {mode === "debat" ? "juri" : "pemimpin"}
                </span>
                <button
                  type="button"
                  onClick={() => setPicked(picked.length ? [] : candidates.slice(0, MAX_PESERTA).map((a) => a.id))}
                  className="shrink-0 rounded-md bg-[#201936] px-2 py-1 text-violet-300 hover:bg-violet-600/20"
                >
                  {picked.length ? "Kosongkan" : "Pilih semua"}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {candidates.map((a) => {
                  const on = picked.includes(a.id);
                  return (
                    <div key={a.id} className={`rounded-xl border p-2 ${on ? "border-violet-400 bg-violet-600/15" : "border-[#2D2548] bg-[#201936]"}`}>
                      <button type="button" onClick={() => toggle(a.id)} className="w-full text-left">
                        <div className="text-sm font-bold">{a.name}</div>
                        <div className="truncate text-[11px] text-[#A9A1C4]">{a.title}</div>
                      </button>
                      {on && mode === "debat" ? (
                        <select
                          aria-label={`Posisi ${a.name}`}
                          value={stances[a.id] ?? defaultStance(a.id)}
                          onChange={(e) => setStances((s) => ({ ...s, [a.id]: e.target.value as Stance }))}
                          className="mt-1 w-full rounded-md bg-[#0D0A14] px-2 py-1 text-xs"
                        >
                          <option value="pro">Pro</option>
                          <option value="kontra">Kontra</option>
                          <option value="celah">Pencari celah</option>
                        </select>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-[#A9A1C4]" htmlFor="rapat-rounds">
                  Putaran
                </label>
                <select
                  id="rapat-rounds"
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="rounded-md bg-[#201936] px-2 py-1 text-sm"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#A9A1C4]">
                  ±{Math.max(1, Math.round(((picked.length * rounds + 2) * 15) / 60))} menit
                </span>
                <button
                  type="button"
                  disabled={busy || !topic.trim() || picked.length < (mode === "debat" ? 2 : 1)}
                  onClick={() => void start()}
                  className="ml-auto rounded-lg bg-violet-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {mode === "debat" ? "Mulai debat" : "Mulai rapat"}
                </button>
              </div>
              {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
            </section>
          ) : null}

          {meeting ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-3 py-1 font-bold ${running ? "bg-teal-400/15 text-teal-300" : "bg-[#201936] text-[#A9A1C4]"}`}>
                  {PHASE_TEXT[meeting.phase] ?? meeting.phase}
                </span>
                <span className="text-[#A9A1C4]">
                  {meeting.mode === "debat" ? "Debat" : "Diskusi"} · putaran {Math.min(meeting.round, meeting.rounds)} dari {meeting.rounds}
                  {!running ? ` · "${meeting.topic}"` : ""}
                </span>
              </div>
              <div ref={scrollRef} className="flex max-h-[46vh] flex-col gap-3 overflow-y-auto pr-1">
                {meeting.transcript.map((t, i) => (
                  <div key={`${t.ts}-${i}`} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-sm font-extrabold">
                      {t.name.replace(/^AM\s+/, "").slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-[#201936] px-3 py-2">
                      <div className="text-xs font-extrabold">
                        {t.name}{" "}
                        {t.stance ? <span className={STANCE_COLOR[t.stance] ?? "text-[#A9A1C4]"}>· {STANCE_TEXT[t.stance] ?? t.stance}</span> : null}
                        {t.live ? <span className="ml-1 animate-pulse text-violet-300">ngomong…</span> : null}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{t.text || "…"}</div>
                    </div>
                  </div>
                ))}
              </div>
              {meeting.error ? <p className="text-sm text-red-300">{meeting.error}</p> : null}
              {running ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void kirimSela();
                  }}
                >
                  <input
                    aria-label="Sela rapat"
                    value={sela}
                    onChange={(e) => setSela(e.target.value)}
                    placeholder="Sela rapat, misalnya: fokus ke biaya dulu"
                    className="min-w-0 flex-1 rounded-lg border border-[#2D2548] bg-[#201936] px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                  <button type="submit" disabled={!sela.trim()} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold disabled:opacity-40">
                    Kirim
                  </button>
                </form>
              ) : null}
            </section>
          ) : null}

          {notulen ? (
            <section className="rounded-2xl border border-violet-500/40 bg-[#17122A] p-4">
              <h3 className="text-base font-extrabold">{meeting?.mode === "debat" ? `Putusan juri · ${meeting.moderatorName}` : "Notulen"}</h3>
              {"raw" in notulen ? (
                <p className="mt-2 whitespace-pre-wrap text-sm">{String(notulen.raw)}</p>
              ) : meeting?.mode === "debat" ? (
                <div className="mt-3 grid gap-2">
                  {[
                    ["Argumen terkuat · PRO", notulen.argumenPro, "text-teal-300"],
                    ["Argumen terkuat · KONTRA", notulen.argumenKontra, "text-pink-300"],
                    ["Celah yang ditemukan", notulen.celah, "text-amber-300"],
                  ].map(([label, value, color]) => (
                    <div key={String(label)} className="rounded-xl bg-[#201936] p-3">
                      <div className={`text-[11px] font-extrabold uppercase ${color}`}>{String(label)}</div>
                      <div className="mt-1 text-sm">{String(value ?? "-")}</div>
                    </div>
                  ))}
                  <div className="rounded-xl bg-violet-600/20 p-3 text-sm font-bold">Rekomendasi: {String(notulen.rekomendasi ?? "-")}</div>
                  <p className="text-xs text-[#A9A1C4]">Keputusan tetap di lu. Yang keluar duit tetap lewat approval.</p>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 text-sm">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase text-[#A9A1C4]">Keputusan</div>
                    <ul className="mt-1 list-disc pl-5">
                      {(Array.isArray(notulen.keputusan) ? notulen.keputusan : []).map((k, i) => (
                        <li key={i}>{String(k)}</li>
                      ))}
                    </ul>
                  </div>
                  {Array.isArray(notulen.risiko) && notulen.risiko.length ? (
                    <div className="rounded-xl bg-amber-400/10 p-3">
                      <div className="text-[11px] font-extrabold uppercase text-amber-300">Risiko</div>
                      <ul className="mt-1 list-disc pl-5">
                        {notulen.risiko.map((r, i) => (
                          <li key={i}>{String(r)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
              {actionItems.length ? (
                <div className="mt-4">
                  <div className="text-[11px] font-extrabold uppercase text-[#A9A1C4]">Action item → jadi tugas</div>
                  <div className="mt-2 grid gap-2">
                    {actionItems.map((a, i) => {
                      const done = meeting?.tasksCreated.includes(i);
                      return (
                        <div key={i} className="flex items-start gap-3 rounded-xl bg-[#201936] p-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold">{a.apa}</div>
                            <div className="text-xs text-[#A9A1C4]">
                              {a.siapa ?? "-"}
                              {a.kapan ? ` · ${a.kapan}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={busy || done}
                            onClick={() => void makeTasks([i])}
                            className="shrink-0 rounded-lg border border-violet-400/40 px-3 py-1 text-xs font-bold disabled:opacity-40"
                          >
                            {done ? "Sudah jadi tugas" : "Jadikan tugas"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void makeTasks()}
                    className="mt-3 w-full rounded-lg bg-violet-600 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    Jadikan semua tugas (lewat Arga)
                  </button>
                  {taskMsg ? <p className="mt-2 text-sm text-teal-300">{taskMsg}</p> : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
