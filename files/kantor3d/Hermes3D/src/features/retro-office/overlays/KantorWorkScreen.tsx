"use client";

// Claude v1.3: layar monitor agent dibuat mirip aplikasi kerja sesuai divisinya.
// Isi diambil dari data nyata (jabatan, tugas Paperclip, aktivitas terakhir). Metrik yang belum
// tersambung ke sumber data ditampilkan "—", tidak dikarang.
import { useEffect, useMemo, useState } from "react";
import type { OfficeDeskMonitor } from "@/lib/office/deskMonitor";
import { kantorCall } from "@/features/kantor/kantorApi";
import { useKantorOverview } from "@/features/kantor/useKantorOverview";

type Issue = { id: string; identifier: string; title: string; status: string; assignee: string | null; updatedAt: string };
export type WorkKind = "ads" | "konten" | "lp" | "dev" | "riset" | "finance" | "cs" | "ceo" | "umum";

export function classifyWork(title: string, role: string): WorkKind {
  const t = `${title} ${role}`.toLowerCase();
  if (role === "ceo" || /\b(ceo|direktur|director|manager umum|pm|project manager)\b/.test(t)) return "ceo";
  if (/meta|ads\b|iklan|paid|traffic|advertis|campaign|kampanye|\bam\b|performance/.test(t)) return "ads";
  if (/landing|\blp\b|website|web page|page builder|scalev|\bcro\b|funnel/.test(t)) return "lp";
  if (/finance|keuangan|akunt|accounting|\bcfo\b|pajak|invoice|kasir/.test(t)) return "finance";
  if (/\bcs\b|customer|whatsapp|\bwa\b|support|layanan|admin chat|closing/.test(t)) return "cs";
  if (/riset|research|analis|analyst|market|insight|data/.test(t) || role === "researcher") return "riset";
  if (/dev|engineer|program|coding|tech|devops|\bit\b|software|qa\b|automation|otomasi/.test(t) || ["engineer", "devops", "cto", "qa"].includes(role)) return "dev";
  if (/konten|content|instagram|tiktok|kreatif|creative|desain|design|copy|sosmed|social|video|editor|reels/.test(t) || role === "designer") return "konten";
  if (role === "cmo") return "ads";
  return "umum";
}

const STATUS_ID: Record<string, string> = {
  todo: "Antri", in_progress: "Dikerjakan", in_review: "Direview", blocked: "Tertahan", done: "Selesai", cancelled: "Batal", backlog: "Backlog",
};
const statusColor = (s: string) =>
  s === "done" ? "bg-emerald-500/15 text-emerald-300" : s === "in_progress" ? "bg-sky-500/15 text-sky-300" : s === "blocked" ? "bg-rose-500/15 text-rose-300" : "bg-white/8 text-white/60";

function useIssues(): Issue[] {
  const [issues, setIssues] = useState<Issue[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      kantorCall<{ issues: Issue[] }>("kantor.issues", { limit: 80 })
        .then((r) => alive && setIssues(r.issues ?? []))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  return issues;
}

function Chrome({ app, url, accent, live, children }: { app: string; url?: string; accent: string; live: boolean; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#0b0d12] text-[#e6e8ee]">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-white/8 bg-[#16181f] px-4">
        <div className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="text-[12px] font-semibold" style={{ color: accent }}>{app}</div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${live ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/50"}`}>
          {live ? "● Bekerja" : "Santai"}
        </span>
        {url ? <div className="min-w-0 max-w-[45%] flex-1 truncate rounded-md bg-black/40 px-3 py-1 font-mono text-[11px] text-white/50">{url}</div> : null}
        <div className="flex-1" />
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Activity({ monitor, max = 4 }: { monitor: OfficeDeskMonitor; max?: number }) {
  const items = monitor.entries.slice(-max);
  if (!items.length) return <div className="text-[12px] text-white/35">Belum ada aktivitas baru.</div>;
  return (
    <div className="space-y-2">
      {items.map((e, i) => (
        <div key={i} className="rounded-md border border-white/6 bg-white/[0.03] px-3 py-2 text-[12px] leading-5 text-white/75">
          <span className="mr-2 text-[9px] font-bold uppercase tracking-wider text-white/35">{e.kind === "user" ? "tugas" : e.kind === "tool" ? "alat" : e.kind === "thinking" ? "mikir" : "hasil"}</span>
          <span className="whitespace-pre-wrap break-words">{e.text.slice(0, 280)}</span>
        </div>
      ))}
    </div>
  );
}

function TaskRows({ issues, empty }: { issues: Issue[]; empty: string }) {
  if (!issues.length) return <div className="px-3 py-6 text-center text-[12px] text-white/35">{empty}</div>;
  return (
    <>
      {issues.slice(0, 7).map((i) => (
        <div key={i.id} className="grid grid-cols-[90px_minmax(0,1fr)_96px] items-center gap-3 border-b border-white/5 px-3 py-2 text-[12px]">
          <span className="font-mono text-white/40">{i.identifier}</span>
          <span className="truncate text-white/85">{i.title}</span>
          <span className={`justify-self-end rounded px-2 py-0.5 text-[10px] font-semibold ${statusColor(i.status)}`}>{STATUS_ID[i.status] ?? i.status}</span>
        </div>
      ))}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[10px] text-white/30">{hint}</div> : null}
    </div>
  );
}

export function KantorWorkScreen({ monitor }: { monitor: OfficeDeskMonitor }) {
  const overview = useKantorOverview();
  const issues = useIssues();
  const me = overview.find((a) => a.id === monitor.agentId || a.name === monitor.agentName);
  const title = me?.title || "";
  const kind = classifyWork(title, me?.role || "");
  const mine = useMemo(() => issues.filter((i) => i.assignee === monitor.agentName), [issues, monitor.agentName]);
  const active = mine.find((i) => i.status === "in_progress") ?? mine.find((i) => i.status === "todo") ?? mine[0];
  const live = monitor.live || Boolean(me?.working);
  const last = monitor.entries.length ? monitor.entries[monitor.entries.length - 1].text : "";
  const done = mine.filter((i) => i.status === "done").length;
  const open = mine.filter((i) => !["done", "cancelled"].includes(i.status)).length;
  const head = (
    <div className="flex items-center justify-between border-b border-white/8 px-4 py-2">
      <div>
        <div className="text-[14px] font-semibold">{monitor.agentName}</div>
        <div className="text-[11px] text-white/45">{title || "Agent"}</div>
      </div>
      <div className="max-w-[55%] truncate text-right text-[11px] text-white/55">
        {active ? `${["in_progress", "todo", "in_review"].includes(active.status) ? "Sedang" : "Terakhir"}: ${active.title}` : "Belum ada tugas"}
      </div>
    </div>
  );

  if (kind === "ads") {
    return (
      <Chrome app="Ads Manager" url="business.facebook.com/adsmanager" accent="#4f8dff" live={live}>
        <div className="flex h-full">
          <div className="w-[200px] shrink-0 border-r border-white/8 bg-[#10131a] p-3 text-[12px]">
            {["Kampanye", "Set Iklan", "Iklan", "Audiens", "Laporan"].map((m, i) => (
              <div key={m} className={`mb-1 rounded-md px-3 py-2 ${i === 0 ? "bg-[#4f8dff]/15 text-[#9dbcff]" : "text-white/55"}`}>{m}</div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {head}
            <div className="grid grid-cols-4 gap-3 p-4">
              <Kpi label="Spend hari ini" value="—" hint="sambungkan Meta API" />
              <Kpi label="CPR" value="—" hint="sambungkan Meta API" />
              <Kpi label="ROAS" value="—" hint="sambungkan Meta API" />
              <Kpi label="Tugas terbuka" value={String(open)} hint={`${done} selesai`} />
            </div>
            <div className="mx-4 overflow-hidden rounded-lg border border-white/8">
              <div className="grid grid-cols-[90px_minmax(0,1fr)_96px] gap-3 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                <span>ID</span><span>Kampanye / tugas</span><span className="justify-self-end">Status</span>
              </div>
              <TaskRows issues={mine} empty="Belum ada tugas iklan." />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4"><Activity monitor={monitor} max={3} /></div>
          </div>
        </div>
      </Chrome>
    );
  }

  if (kind === "konten") {
    return (
      <Chrome app="Studio Konten" url="studio konten · instagram & reels" accent="#ff6fb5" live={live}>
        <div className="flex h-full flex-col">
          {head}
          <div className="flex min-h-0 flex-1 gap-4 p-4">
            <div className="grid flex-1 grid-cols-3 gap-3">
              {[0, 1, 2].map((k) => {
                const it = mine[k];
                return (
                  <div key={k} className="flex flex-col overflow-hidden rounded-xl border border-white/8 bg-[#141018]">
                    <div className="relative min-h-0 flex-1 bg-gradient-to-br from-fuchsia-500/35 via-rose-400/20 to-amber-300/25">
                      <div className="absolute inset-x-3 bottom-3 rounded-md bg-black/45 px-2 py-1 text-[11px] font-semibold leading-4 text-white">
                        {it ? it.title : k === 0 ? "Draft kosong" : "Slot konten"}
                      </div>
                      <div className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] uppercase text-white/80">{k === 1 ? "Reels" : "Carousel"}</div>
                    </div>
                    <div className="px-2 py-1.5 text-[10px] text-white/50">{it ? STATUS_ID[it.status] ?? it.status : "—"}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex w-[300px] flex-col rounded-xl border border-white/8 bg-[#111317]">
              <div className="border-b border-white/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">Caption / naskah</div>
              <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-5 text-white/80">
                {last || "Belum ada naskah. Tunggu tugas konten berikutnya."}
              </div>
            </div>
          </div>
        </div>
      </Chrome>
    );
  }

  if (kind === "lp") {
    return (
      <Chrome app="Page Builder" url={active ? `draft · ${active.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}` : "draft · landing-page"} accent="#34d399" live={live}>
        <div className="flex h-full">
          <div className="w-[190px] shrink-0 border-r border-white/8 bg-[#0f1412] p-3 text-[12px]">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Bagian halaman</div>
            {["Hero & headline", "Masalah", "Solusi / produk", "Testimoni", "Penawaran", "FAQ", "Tombol order"].map((m, i) => (
              <div key={m} className={`mb-1 rounded-md px-3 py-1.5 ${i === 0 ? "bg-emerald-500/15 text-emerald-200" : "text-white/55"}`}>{m}</div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {head}
            <div className="min-h-0 flex-1 overflow-hidden bg-[#e9ecef] p-5">
              <div className="mx-auto h-full max-w-[560px] overflow-hidden rounded-lg bg-white shadow-xl">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-6 text-white">
                  <div className="text-[18px] font-bold leading-6">{active?.title ?? "Headline landing page"}</div>
                  <div className="mt-2 h-2 w-2/3 rounded bg-white/50" />
                  <div className="mt-4 inline-block rounded-full bg-amber-400 px-4 py-1.5 text-[12px] font-bold text-black">Pesan sekarang</div>
                </div>
                <div className="space-y-2 p-5">
                  {[90, 75, 82, 60].map((w, i) => <div key={i} className="h-2.5 rounded bg-slate-200" style={{ width: `${w}%` }} />)}
                  <div className="grid grid-cols-3 gap-2 pt-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded bg-slate-100" />)}</div>
                </div>
              </div>
            </div>
            <div className="max-h-[28%] overflow-auto border-t border-white/8 p-3"><Activity monitor={monitor} max={2} /></div>
          </div>
        </div>
      </Chrome>
    );
  }

  if (kind === "finance") {
    return (
      <Chrome app="Spreadsheet Keuangan" url="laporan keuangan.xlsx" accent="#22c55e" live={live}>
        <div className="flex h-full flex-col">
          {head}
          <div className="grid grid-cols-[48px_repeat(5,minmax(0,1fr))] border-b border-white/8 bg-white/[0.04] font-mono text-[11px] text-white/45">
            {["", "A · Tanggal", "B · Keterangan", "C · Masuk", "D · Keluar", "E · Status"].map((h, i) => <div key={i} className="border-r border-white/6 px-2 py-1.5">{h}</div>)}
          </div>
          <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px]">
            {Array.from({ length: 14 }).map((_, r) => {
              const it = mine[r];
              return (
                <div key={r} className="grid grid-cols-[48px_repeat(5,minmax(0,1fr))] border-b border-white/5">
                  <div className="border-r border-white/6 bg-white/[0.03] px-2 py-1.5 text-white/35">{r + 1}</div>
                  <div className="border-r border-white/6 px-2 py-1.5 text-white/60">{it ? new Date(it.updatedAt).toLocaleDateString("id-ID") : ""}</div>
                  <div className="truncate border-r border-white/6 px-2 py-1.5 text-white/85">{it?.title ?? ""}</div>
                  <div className="border-r border-white/6 px-2 py-1.5 text-white/40">{it ? "—" : ""}</div>
                  <div className="border-r border-white/6 px-2 py-1.5 text-white/40">{it ? "—" : ""}</div>
                  <div className="px-2 py-1.5 text-white/60">{it ? STATUS_ID[it.status] ?? it.status : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Chrome>
    );
  }

  if (kind === "cs") {
    const chat = monitor.entries.slice(-8);
    return (
      <Chrome app="WhatsApp Business" url="chat pelanggan" accent="#25d366" live={live}>
        <div className="flex h-full">
          <div className="w-[230px] shrink-0 border-r border-white/8 bg-[#0e1513]">
            <div className="border-b border-white/8 px-3 py-2 text-[12px] font-semibold">Percakapan</div>
            {(mine.length ? mine.slice(0, 6).map((i) => i.title) : ["Belum ada percakapan"]).map((t, i) => (
              <div key={i} className={`flex items-center gap-2 border-b border-white/5 px-3 py-2.5 ${i === 0 ? "bg-white/[0.05]" : ""}`}>
                <div className="h-8 w-8 shrink-0 rounded-full bg-emerald-700/50" />
                <div className="min-w-0 truncate text-[12px] text-white/75">{t}</div>
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col bg-[#0b141a]">
            {head}
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-4">
              {chat.length ? chat.map((e, i) => (
                <div key={i} className={`max-w-[75%] rounded-lg px-3 py-2 text-[12px] leading-5 ${e.kind === "user" ? "bg-[#202c33] text-white/85" : "ml-auto bg-[#005c4b] text-white"}`}>
                  {e.text.slice(0, 300)}
                </div>
              )) : <div className="text-center text-[12px] text-white/35">Belum ada chat masuk.</div>}
            </div>
          </div>
        </div>
      </Chrome>
    );
  }

  if (kind === "riset") {
    return (
      <Chrome app="Riset" url={`google.com/search?q=${encodeURIComponent(active?.title ?? "riset pasar")}`} accent="#fbbf24" live={live}>
        <div className="flex h-full">
          <div className="flex min-w-0 flex-1 flex-col">
            {head}
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] text-white/80">🔎 {active?.title ?? "Belum ada topik riset"}</div>
              {(monitor.entries.length ? monitor.entries.slice(-4) : []).map((e, i) => (
                <div key={i}>
                  <div className="text-[13px] font-medium text-[#8ab4f8]">Catatan sumber #{i + 1}</div>
                  <div className="text-[12px] leading-5 text-white/65">{e.text.slice(0, 220)}</div>
                </div>
              ))}
              {!monitor.entries.length ? <div className="text-[12px] text-white/35">Belum ada hasil riset.</div> : null}
            </div>
          </div>
          <div className="w-[260px] shrink-0 border-l border-white/8 bg-[#14130f] p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Daftar riset</div>
            <TaskRows issues={mine} empty="Belum ada tugas riset." />
          </div>
        </div>
      </Chrome>
    );
  }

  if (kind === "ceo") {
    const cols: Array<[string, string[]]> = [["Antri", ["todo", "backlog"]], ["Dikerjakan", ["in_progress", "in_review", "blocked"]], ["Selesai", ["done"]]];
    return (
      <Chrome app="Papan Kendali CEO" url="kantor · semua tugas tim" accent="#a78bfa" live={live}>
        <div className="flex h-full flex-col">
          {head}
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 p-4">
            {cols.map(([label, sts]) => {
              const list = issues.filter((i) => sts.includes(i.status)).slice(0, 7);
              return (
                <div key={label} className="flex min-h-0 flex-col rounded-xl border border-white/8 bg-white/[0.03]">
                  <div className="border-b border-white/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">{label} · {issues.filter((i) => sts.includes(i.status)).length}</div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
                    {list.map((i) => (
                      <div key={i.id} className="rounded-lg border border-white/6 bg-[#151821] px-2.5 py-2">
                        <div className="text-[12px] leading-4 text-white/85">{i.title}</div>
                        <div className="mt-1 flex justify-between text-[10px] text-white/40"><span>{i.identifier}</span><span>{i.assignee ?? "-"}</span></div>
                      </div>
                    ))}
                    {!list.length ? <div className="px-2 py-4 text-center text-[11px] text-white/30">Kosong</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Chrome>
    );
  }

  // umum (dan dev tanpa editor): dokumen kerja + daftar tugas
  return (
    <Chrome app="Ruang Kerja" url="dokumen kerja" accent="#93c5fd" live={live}>
      <div className="flex h-full">
        <div className="flex min-w-0 flex-1 flex-col">
          {head}
          <div className="min-h-0 flex-1 overflow-auto bg-[#f3f4f6] p-5">
            <div className="mx-auto min-h-full max-w-[620px] rounded bg-white p-6 text-[13px] leading-6 text-slate-800 shadow">
              <div className="mb-3 text-[17px] font-bold">{active?.title ?? "Catatan kerja"}</div>
              <div className="whitespace-pre-wrap break-words">{last || "Belum ada catatan."}</div>
            </div>
          </div>
        </div>
        <div className="w-[270px] shrink-0 border-l border-white/8 bg-[#10131a] p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Tugasku</div>
          <TaskRows issues={mine} empty="Belum ada tugas." />
        </div>
      </div>
    </Chrome>
  );
}
