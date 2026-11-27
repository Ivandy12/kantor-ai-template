// Client helper untuk memanggil method adapter kantor.scene.dialog (Brief Tahap 4: D5 & E)
import { kantorCall } from "./kantorApi";

export type DialogLine = {
  speakerId: string;
  name: string;
  text: string;
};

export type SceneDialogResult = {
  kind: string;
  title: string;
  lines: DialogLine[];
};

// Cache dialog per judul tugas & tipe agar tidak panggil ulang jika sama
const dialogCache = new Map<string, DialogLine[]>();

/**
 * Panggil method adapter kantor.scene.dialog (dibuat Claude).
 * Jika gagal / timeout (>20 dtk), fallback otomatis ke template kalimat terstruktur (D5).
 */
export async function fetchSceneDialog(params: {
  kind: "brief_bos" | "brief" | "lapor" | "lapor_bos";
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  title: string;
  description?: string;
}): Promise<DialogLine[]> {
  const cacheKey = `${params.kind}:${params.fromId}:${params.toId}:${params.title}`;
  if (dialogCache.has(cacheKey)) {
    return dialogCache.get(cacheKey)!;
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 20000)
    );

    const callPromise = kantorCall<SceneDialogResult>("kantor.scene.dialog", {
      kind: params.kind,
      fromId: params.fromId,
      toId: params.toId,
      title: params.title,
      description: params.description,
    });

    const res = await Promise.race([callPromise, timeoutPromise]);
    if (res && Array.isArray(res.lines) && res.lines.length > 0) {
      dialogCache.set(cacheKey, res.lines);
      return res.lines;
    }
  } catch (err) {
    // Adapter belum siap atau timeout -> gunakan fallback cerdas D5
  }

  // Fallback terstruktur sesuai aturan D5
  const shortTitle = params.title.slice(0, 50);
  const fallbackLines: DialogLine[] = [];

  if (params.kind === "brief_bos") {
    fallbackLines.push(
      { speakerId: params.fromId, name: params.fromName, text: `Geto, tolong jalankan tugas: ${shortTitle}` },
      { speakerId: params.toId, name: params.toName, text: `Baik Sensei Gojo, segera saya delegasikan ke divisi terkait.` }
    );
  } else if (params.kind === "brief") {
    fallbackLines.push(
      { speakerId: params.fromId, name: params.fromName, text: `${params.toName}, ini ada arahan baru: ${shortTitle}` },
      { speakerId: params.toId, name: params.toName, text: `Siap Geto-san, langsung kami kerjakan sekarang!` }
    );
  } else if (params.kind === "lapor") {
    fallbackLines.push(
      { speakerId: params.fromId, name: params.fromName, text: `Geto-san, tugas ${shortTitle} sudah tuntas 100%!` },
      { speakerId: params.toId, name: params.toName, text: `Mantap, terima kasih kerja kerasnya! Saya teruskan ke Sensei Gojo.` }
    );
  } else if (params.kind === "lapor_bos") {
    fallbackLines.push(
      { speakerId: params.fromId, name: params.fromName, text: `Lapor Sensei Gojo, tugas ${shortTitle} selesai dengan hasil optimal.` },
      { speakerId: params.toId, name: params.toName, text: `Bagus sekali Geto, kerja tim luar biasa 👍` }
    );
  }

  dialogCache.set(cacheKey, fallbackLines);
  return fallbackLines;
}
