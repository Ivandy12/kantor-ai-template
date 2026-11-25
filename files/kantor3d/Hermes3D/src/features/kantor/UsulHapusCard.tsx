"use client";

// Claude hapus-agent: Arga cuma mengusulkan; agent baru dihentikan setelah Fauzy klik setuju di kartu ini.
import { useCallback, useEffect, useState } from "react";

import { kantorCall } from "@/features/kantor/kantorApi";

type Usul = { id: string; agentId: string; agentName: string; agentTitle: string; alasan: string; ts: number };

export function UsulHapusCard() {
  const [list, setList] = useState<Usul[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const out = await kantorCall<{ usulan: Usul[] }>("kantor.agent.hapus.list");
      setList(out.usulan ?? []);
    } catch {
      /* adapter belum siap */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const jawab = async (u: Usul, setuju: boolean) => {
    setBusy(u.id);
    try {
      await kantorCall(setuju ? "kantor.agent.hapus.setujui" : "kantor.agent.hapus.tolak", { id: u.id });
      setInfo(setuju ? `${u.agentName} sudah dihentikan dan keluar dari kantor.` : `Usulan menghapus ${u.agentName} dibatalkan.`);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : "Gagal memproses usulan.");
    } finally {
      setBusy(null);
      void refresh();
      window.setTimeout(() => setInfo(null), 6000);
    }
  };

  if (!list.length && !info) return null;

  return (
    <div className="fixed left-1/2 top-24 z-[170] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
      {info ? <div className="rounded-xl border border-white/15 bg-[#120e08]/95 px-4 py-3 text-sm text-amber-100 shadow-2xl">{info}</div> : null}
      {list.map((u) => (
        <div key={u.id} role="alertdialog" aria-label={`Usulan hapus ${u.agentName}`} className="rounded-xl border border-red-500/40 bg-[#160c0c]/95 p-4 text-sm text-amber-50 shadow-2xl backdrop-blur">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-red-300/80">Arga mengusulkan</div>
          <div className="mt-1 text-base font-semibold">
            Hapus {u.agentName}
            {u.agentTitle ? <span className="font-normal text-amber-100/60"> · {u.agentTitle}</span> : null}
          </div>
          {u.alasan ? <p className="mt-2 text-amber-100/80">{u.alasan}</p> : null}
          <p className="mt-2 text-xs text-amber-100/55">Agent berhenti bekerja dan keluar dari kantor. Riwayat kerjanya tetap tersimpan.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={busy === u.id} onClick={() => void jawab(u, false)} className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-amber-100 hover:bg-white/10 disabled:opacity-40">
              Batalkan
            </button>
            <button type="button" disabled={busy === u.id} onClick={() => void jawab(u, true)} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-500 disabled:opacity-40">
              Ya, hapus {u.agentName}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
