"use client";

import { useState } from "react";

import { kantorCall } from "@/features/kantor/kantorApi";

/**
 * Tombol "Jadikan tugas" di panel chat: ubah obrolan jadi tugas Paperclip.
 * v1.5: Fauzy bisa pilih — langsung dikerjakan agent yang diajak ngobrol (lebih cepat & hemat),
 * atau lewat Arga (CEO) dulu. Aksi berisiko tetap wajib approval.
 */
export function JadikanTugasButton({
  agentId,
  agentName,
  ceoId,
}: {
  agentId: string;
  agentName: string;
  ceoId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCeo = (ceoId && agentId === ceoId) || /^arga$/i.test(agentName);
  const [lewat, setLewat] = useState<"langsung" | "arga">("langsung");

  const openForm = async () => {
    setOpen(true);
    setResult(null);
    setError(null);
    try {
      const last = await kantorCall<{ user?: string; assistant?: string }>("kantor.chat.last", { agentId });
      if (!title && last.user) setTitle(last.user.slice(0, 120));
      if (!desc && (last.user || last.assistant)) {
        setDesc(
          [last.user ? `Permintaan Fauzy: ${last.user}` : "", last.assistant ? `Rencana dari ${agentName}: ${last.assistant}` : ""]
            .filter(Boolean)
            .join("\n\n"),
        );
      }
    } catch {
      /* isi manual */
    }
  };

  const langsung = !isCeo && lewat === "langsung";

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await kantorCall<{ identifier?: string; assignee?: string }>("kantor.task.create", {
        agentId,
        title,
        description: desc,
        direct: langsung,
        ...(langsung ? { assigneeAgentId: agentId } : {}),
      });
      setResult(`${out.identifier ?? "Tugas"} masuk ke ${out.assignee ?? (langsung ? agentName : "Arga")}. Aksi berisiko tetap minta izin lu.`);
      setTitle("");
      setDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal bikin tugas.");
    } finally {
      setBusy(false);
    }
  };

  const target = langsung ? agentName : "Arga";

  return (
    <>
      <button
        type="button"
        onClick={() => void openForm()}
        className="rounded-md border border-violet-400/40 bg-violet-600/20 px-2.5 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-600/35"
        title="Ubah obrolan ini jadi tugas resmi"
      >
        Jadikan tugas
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Jadikan tugas"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-violet-500/40 bg-[#17122A] p-5 text-[#F1EEF9] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Jadikan tugas</h2>
            {isCeo ? (
              <p className="mt-1 text-sm text-[#A9A1C4]">
                Masuk ke Arga. Tugas simpel dia kerjakan sendiri, yang butuh keahlian dibagi ke satu staf yang cocok.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Siapa yang mengerjakan">
                <button
                  type="button"
                  role="radio"
                  aria-checked={lewat === "langsung"}
                  onClick={() => setLewat("langsung")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    lewat === "langsung" ? "border-violet-400 bg-violet-600/25" : "border-[#2D2548] bg-[#201936]"
                  }`}
                >
                  <span className="block font-semibold">Langsung ke {agentName}</span>
                  <span className="block text-xs text-[#A9A1C4]">Paling cepat & hemat token</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={lewat === "arga"}
                  onClick={() => setLewat("arga")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    lewat === "arga" ? "border-violet-400 bg-violet-600/25" : "border-[#2D2548] bg-[#201936]"
                  }`}
                >
                  <span className="block font-semibold">Lewat Arga</span>
                  <span className="block text-xs text-[#A9A1C4]">Arga atur & bagi ke tim</span>
                </button>
              </div>
            )}
            <label className="mt-4 block text-xs font-semibold text-[#A9A1C4]" htmlFor="kantor-task-title">
              Judul
            </label>
            <input
              id="kantor-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#2D2548] bg-[#201936] px-3 py-2 text-sm outline-none focus:border-violet-400"
              placeholder="Misal: cek iklan semua akun hari ini + evaluasi"
            />
            <label className="mt-3 block text-xs font-semibold text-[#A9A1C4]" htmlFor="kantor-task-desc">
              Detail
            </label>
            <textarea
              id="kantor-task-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-lg border border-[#2D2548] bg-[#201936] px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
            {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
            {result ? <p className="mt-2 text-sm text-teal-300">{result}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[#2D2548] px-4 py-2 text-sm font-semibold"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={busy || !title.trim()}
                onClick={() => void submit()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "Mengirim…" : `Kirim ke ${target}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
