// Claude anti-tembus (30 Okt 2026): kotak padat furnitur sesuai yang KELIHATAN di layar.
// Model GLB dipasang dengan pivot di pojok item lalu diputar di tengah footprint (buildFurnitureItemMatrix),
// jadi wujudnya sering bergeser keluar dari footprint item. Nav-grid lama memblok footprint, bukan wujudnya,
// makanya agent bisa jalan menembus meja/kursi yang kelihatan.
import { SCALE } from "@/features/retro-office/core/constants";
import { getItemBaseSize, getItemRotationRadians } from "@/features/retro-office/core/geometry";
import type { FurnitureItem } from "@/features/retro-office/core/types";

export type Rect = { x1: number; y1: number; x2: number; y2: number; uid: string; type: string };

/** Radius badan agent (px denah) — dipakai nav-grid & tes tembus. */
export const AGENT_BODY_R = 14; // Claude padding14: belok melengkung motong sudut ~5px

// Bounding box GLB [xMin, xMax, zMin, zMax] dalam satuan model (diukur dari accessor POSITION file .glb)
const GLB_BOX: Record<string, [number, number, number, number]> = {
  chair: [0, 0.335, -0.314, 0], exec_chair: [0, 0.335, -0.314, 0], guest_chair: [0, 0.335, -0.314, 0],
  round_table: [0, 0.693, -0.8, 0],
  couch: [0, 0.98, -0.41, 0], couch_v: [0, 0.73, -0.41, 0], beanbag: [0, 0.73, -0.41, 0],
  bookshelf: [0, 0.4, -0.25, 0], plant: [-0.086, 0.086, -0.099, 0.099],
  pingpong: [-0.461, 0.2, -0.3, 0.1], table_rect: [0, 0.841, -0.447, 0],
  coffee_machine: [0, 0.19, -0.24, 0], printer: [0, 0.19, -0.24, 0],
  fridge: [0, 0.43, -0.282, 0.01], water_cooler: [-0.047, 0.047, -0.047, 0.047],
  cabinet: [0, 0.43, -0.45, 0], lamp: [-0.016, 0.136, -0.148, 0.028],
};
// sama dengan FURNITURE_SCALE di objects/furniture.tsx
const GLB_SCALE: Record<string, [number, number, number]> = {
  chair: [1.2, 1.2, 1.2], exec_chair: [1.6, 1.75, 1.6], guest_chair: [1.25, 1.25, 1.25],
  round_table: [2, 2, 2], couch: [1.8, 1.8, 1.8], couch_v: [1.4, 1.4, 1.4], beanbag: [1, 1, 1],
  bookshelf: [1.5, 2, 1.5], plant: [1.2, 1.8, 1.2], pingpong: [2.4, 1.2, 1.6], table_rect: [1.4, 1.2, 1.0],
  coffee_machine: [0.8, 0.8, 0.8], printer: [1, 1.2, 0.8], fridge: [1, 1.4, 1], water_cooler: [1, 2, 1],
  cabinet: [2.6, 1.2, 1], lamp: [1.2, 1.2, 1.2],
};
export const CHAIR_TYPES = new Set(["chair", "exec_chair", "guest_chair"]);

/** Kotak yang kelihatan (px denah) untuk item GLB / meja kerja; null = pakai footprint biasa. */
export function visualRect(item: FurnitureItem): Rect | null {
  if (item.type === "desk_cubicle") {
    // meja vendor roving: 4.4×2.2 × ROVING_SCALE(0.468) = 114×57 px, pusat (x+40, y+36.6), facing 0
    return { x1: item.x - 17, y1: item.y + 8, x2: item.x + 97, y2: item.y + 65, uid: item._uid, type: item.type };
  }
  const box = GLB_BOX[item.type];
  const sc = GLB_SCALE[item.type];
  if (!box || !sc) return null;
  const { width, height } = getItemBaseSize(item);
  const rot = getItemRotationRadians(item);
  const px = width * SCALE * 0.5, pz = height * SCALE * 0.5;
  const xs: number[] = [], ys: number[] = [];
  for (const bx of [box[0], box[1]]) for (const bz of [box[2], box[3]]) {
    const lx = bx * sc[0] - px, lz = bz * sc[2] - pz;
    xs.push(item.x + (lx * Math.cos(rot) + lz * Math.sin(rot) + px) / SCALE);
    ys.push(item.y + (-lx * Math.sin(rot) + lz * Math.cos(rot) + pz) / SCALE);
  }
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys), uid: item._uid, type: item.type };
}

let solids: Rect[] = [];
export function setSolids(list: Rect[]) {
  solids = list;
  if (typeof window !== "undefined") (window as any).__K3D_SOLIDS__ = list; // buat tes tembus
}
export function getSolids(): Rect[] {
  return solids;
}
