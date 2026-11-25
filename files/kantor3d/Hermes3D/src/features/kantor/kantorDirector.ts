// Claude: pengarah gerak sederhana — target duduk/berdiri sementara per agent, dipicu event NYATA.
export type DirTarget = { x: number; y: number; facing: number; sit: boolean; until: number; reason: string; holdMs?: number; arrived?: boolean };
const targets = new Map<string, DirTarget>();
export const kantorDirector = {
  get(id: string): DirTarget | undefined {
    const t = targets.get(id);
    if (t && Date.now() > t.until) { targets.delete(id); return undefined; }
    return t;
  },
  /** ms = lama duduk/berdiri SETELAH tiba; perjalanan diberi batas 3 menit. */
  set(id: string, t: Omit<DirTarget, "until" | "holdMs" | "arrived">, ms: number) {
    const cur = targets.get(id);
    // Claude tombol-rapat: selama rapat, agent nggak ditarik keluar oleh tugas/obrolan (kecuali dipanggil)
    if (cur && cur.reason === "rapat" && Date.now() <= cur.until && t.reason !== "rapat" && t.reason !== "summon") return;
    if (cur && cur.arrived && cur.x === t.x && cur.y === t.y) { cur.until = Date.now() + ms; cur.holdMs = ms; return; }
    targets.set(id, { ...t, holdMs: ms, arrived: false, until: Date.now() + ms + 180000 });
  },
  /** dipanggil saat agent sampai di target: hitung mundur lama duduk mulai sekarang. */
  arrive(id: string) {
    const t = targets.get(id);
    if (t && !t.arrived) { t.arrived = true; t.until = Date.now() + (t.holdMs ?? 20000); }
  },
  clear(id: string) { targets.delete(id); },
  list(reason?: string): Array<[string, DirTarget]> {
    const now = Date.now(); const out: Array<[string, DirTarget]> = [];
    for (const [k, t] of targets) { if (now > t.until) { targets.delete(k); continue; } if (!reason || t.reason === reason) out.push([k, t]); }
    return out;
  },
};
// titik duduk (tengah kursi). facing dalam RADIAN: 0 = hadap selatan (+y), Math.PI = hadap utara
export const BOSS_SEAT = { x: 180, y: 66, facing: 0, sit: true }; // Claude fix16
export const CEO_SEAT = { x: 530, y: 66, facing: 0, sit: true };
export const BOSS_GUEST_SEATS = [{ x: 145, y: 152, facing: Math.PI, sit: true }, { x: 215, y: 152, facing: Math.PI, sit: true }];
// Claude ruang-rapat/panggil: titik berdiri di depan meja bos (antara & di belakang kursi tamu), hadap bos.
// Dulu semua yang dipanggil ke 1 titik (180,145) yang nempel kursi tamu -> tumpuk & nembus.
export const SUMMON_SPOTS = [
  { x: 180, y: 152, facing: Math.PI, sit: false }, { x: 180, y: 192, facing: Math.PI, sit: false },
  { x: 132, y: 192, facing: Math.PI, sit: false }, { x: 228, y: 192, facing: Math.PI, sit: false },
  { x: 100, y: 150, facing: Math.PI, sit: false }, { x: 260, y: 150, facing: Math.PI, sit: false },
];
export const CEO_GUEST_SEATS = [{ x: 495, y: 152, facing: Math.PI, sit: true }, { x: 565, y: 152, facing: Math.PI, sit: true }];
// Claude v1.3: titik duduk pantry & lounge dihitung dari kursi/sofa yang BENERAN ada di denah
export { PANTRY_SEATS, LOUNGE_SEATS } from "./kantorLayout";

/** Kursi tamu yang masih kosong (tidak dipakai target lain). */
export function freeSeat(seats: Array<{ x: number; y: number; facing: number; sit: boolean }>) {
  const used = kantorDirector.list().map(([, t]) => `${t.x},${t.y}`);
  return seats.find((s) => !used.includes(`${s.x},${s.y}`)) ?? null;
}
