"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { kantorCall, type KantorAgent } from "@/features/kantor/kantorApi";
import { getBrandName } from "@/features/kantor/brand";

type Issue = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  assignee: string | null;
  parentIdentifier: string | null;
  updatedAt: string;
};
type Approval = { id: string; title: string; requestedBy: string | null; createdAt: string; status: string };

const STATUS_TEXT: Record<string, [string, string]> = {
  todo: ["Antre", "bg-[#201936] text-[#A9A1C4]"],
  in_progress: ["Dikerjain", "bg-teal-400/15 text-teal-300"],
  in_review: ["Direview", "bg-violet-500/20 text-violet-200"],
  blocked: ["Nunggu", "bg-amber-400/15 text-amber-300"],
  done: ["Selesai", "bg-[#201936] text-[#A9A1C4]"],
  cancelled: ["Batal", "bg-[#201936] text-[#6B6488]"],
  backlog: ["Backlog", "bg-[#201936] text-[#A9A1C4]"],
};

function AgentChip({ a }: { a: KantorAgent }) {
  const dot = a.working ? "bg-teal-300" : a.paperclipStatus === "error" ? "bg-red-400" : "bg-[#6B6488]";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#2D2548] bg-[#201936] px-3 py-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{a.name}</div>
        <div className="truncate text-[11px] text-[#A9A1C4]">{a.working && a.currentIssue ? a.currentIssue : a.title}</div>
      </div>
    </div>
  );
}

/** Panel "Tim & tugas": org chart singkat, tugas terbaru, approval yang nunggu. */
export function TimPanel({ open, onClose, agents }: { open: boolean; onClose: () => void; agents: KantorAgent[] }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [i, a] = await Promise.all([
        kantorCall<{ issues: Issue[] }>("kantor.issues", { limit: 25 }),
        kantorCall<{ approvals: Approval[] }>("kantor.approvals"),
      ]);
      setIssues(i.issues ?? []);
      setApprovals(a.approvals ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal ambil data.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  const tree = useMemo(() => {
    const ceo = agents.find((a) => a.role === "ceo") ?? null;
    const heads = agents.filter((a) => ceo && a.reportsTo === ceo.id);
    const childrenOf = (id: string) => agents.filter((a) => a.reportsTo === id);
    return { ceo, heads, childrenOf };
  }, [agents]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-stretch justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Tim dan tugas">
      <div className="flex h-full w-full max-w-[880px] flex-col border-l border-violet-500/30 bg-[#0D0A14]/95 text-[#F1EEF9] shadow-2xl backdrop-blur">
        <header className="flex items-center justify-between gap-3 border-b border-[#2D2548] px-5 py-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-violet-300">{getBrandName()}</div>
            <h2 className="text-xl font-extrabold">Tim & tugas</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg bg-[#201936] px-3 py-2 text-sm font-semibold">
            Tutup
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <section className="rounded-2xl border border-amber-400/30 bg-[#17122A] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">Nunggu keputusan lu</h3>
              <a href="/DIG/dashboard" target="_top" className="text-xs font-semibold text-violet-300">
                Buka di Paperclip ↗
              </a>
            </div>
            {approvals.length === 0 ? (
              <p className="mt-2 text-sm text-[#A9A1C4]">Nggak ada yang nunggu. Approval baru juga masuk Telegram.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {approvals.map((a) => (
                  <li key={a.id} className="rounded-xl bg-[#201936] p-3 text-sm">
                    <div className="font-bold">{a.title}</div>
                    <div className="text-xs text-[#A9A1C4]">{a.requestedBy ?? "-"}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-base font-extrabold">Bagan tim</h3>
            {tree.ceo ? (
              <div className="flex flex-col gap-3">
                <div className="max-w-xs">
                  <AgentChip a={tree.ceo} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tree.heads.map((h) => {
                    const kids = tree.childrenOf(h.id);
                    return (
                      <div key={h.id} className="rounded-2xl border border-[#2D2548] bg-[#17122A] p-3">
                        <AgentChip a={h} />
                        {kids.length ? (
                          <div className="mt-2 grid gap-2 border-l-2 border-violet-500/40 pl-3">
                            {kids.map((k) => (
                              <AgentChip key={k.id} a={k} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#A9A1C4]">Data tim belum kebaca.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-base font-extrabold">Tugas terbaru</h3>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="overflow-x-auto rounded-xl border border-[#2D2548]">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-[#201936] text-left text-xs text-[#A9A1C4]">
                  <tr>
                    <th className="px-3 py-2">Kode</th>
                    <th className="px-3 py-2">Tugas</th>
                    <th className="px-3 py-2">Dipegang</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((i) => {
                    const [label, cls] = STATUS_TEXT[i.status] ?? [i.status, "bg-[#201936]"];
                    return (
                      <tr key={i.id} className="border-t border-[#2D2548]">
                        <td className="px-3 py-2 font-mono text-xs text-violet-300">{i.identifier}</td>
                        <td className="px-3 py-2">
                          {i.title}
                          {i.parentIdentifier ? <span className="ml-1 text-xs text-[#6B6488]">↳ {i.parentIdentifier}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-[#A9A1C4]">{i.assignee ?? "-"}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
