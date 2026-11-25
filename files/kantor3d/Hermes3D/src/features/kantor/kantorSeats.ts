// Claude duduk-pas (30 Okt 2026): titik & tinggi dudukan dihitung dari furnitur yang BENERAN dirender.
// Kursi GLB (chairDesk.glb, kit Kenney) dipasang dengan pivot di pojok item lalu diputar di tengah footprint
// (lihat buildFurnitureItemMatrix di objects/furniture.tsx), jadi pusat dudukannya BUKAN item.x + w/2.
import { SCALE } from "@/features/retro-office/core/constants";
import { getItemBaseSize, getItemRotationRadians } from "@/features/retro-office/core/geometry";
import type { FurnitureItem } from "@/features/retro-office/core/types";

// chairDesk.glb: bounding box x 0..0.335, z -0.314..0, permukaan dudukan y≈0.19 (diukur dari vertex GLB)
const CHAIR_GLB_CENTER = { x: 0.1675, z: -0.157 };
const CHAIR_GLB_SEAT_TOP = 0.19;
const CHAIR_SCALE: Record<string, [number, number, number]> = {
  chair: [1.2, 1.2, 1.2],
  exec_chair: [1.6, 1.75, 1.6],
  guest_chair: [1.25, 1.25, 1.25],
};
/** Kursi Aeron bawaan meja kerja (vendor roving desk): SEAT_HEIGHT 0.68 × ROVING_SCALE. */
export const DESK_SEAT_HEIGHT = 0.318;
/** Tinggi pantat avatar Rocketbox (skala 0.95) di atas kaki saat animasi duduk. */
export const AVATAR_SIT_HIP = 0.428;

export type Seat = { x: number; y: number; h: number; facing: number; type: string; uid?: string };

/** Pusat dudukan kursi GLB dalam koordinat denah (px), plus arah hadap orang yang duduk. */
export function chairSeatPoint(item: FurnitureItem): Seat | null {
  const sc = CHAIR_SCALE[item.type];
  if (!sc) return null;
  const { width, height } = getItemBaseSize(item);
  const rot = getItemRotationRadians(item);
  const px = width * SCALE * 0.5, pz = height * SCALE * 0.5;
  const lx = CHAIR_GLB_CENTER.x * sc[0] - px, lz = CHAIR_GLB_CENTER.z * sc[2] - pz;
  // three.js rotasi Y: (x, z) -> (x cos + z sin, -x sin + z cos)
  const wx = lx * Math.cos(rot) + lz * Math.sin(rot) + px;
  const wz = -lx * Math.sin(rot) + lz * Math.cos(rot) + pz;
  return {
    x: Math.round((item.x + wx / SCALE) * 10) / 10,
    y: Math.round((item.y + wz / SCALE) * 10) / 10,
    h: CHAIR_GLB_SEAT_TOP * sc[1],
    // facing 0 = hadap selatan (+y); kursi diputar 180 -> orangnya hadap utara
    facing: rot,
    type: item.type,
    uid: item._uid,
  };
}

let registry: Seat[] = [];
export function registerSeats(furniture: FurnitureItem[], deskLocations: Array<{ x: number; y: number }>) {
  const seats: Seat[] = deskLocations.map((d) => ({ x: d.x, y: d.y, h: DESK_SEAT_HEIGHT, facing: 0, type: "desk" }));
  for (const it of furniture) {
    const s = chairSeatPoint(it);
    if (s) seats.push(s);
  }
  registry = seats;
  if (typeof window !== "undefined") (window as any).__K3D_SEATS__ = seats; // buat alat ukur
}
export function getSeats(): Seat[] {
  return registry;
}
/** Tinggi dudukan di titik (x, y) denah; kalau nggak ada kursi dekat, pakai tinggi kursi meja. */
export function seatHeightAt(x: number, y: number): number {
  let best: Seat | null = null;
  let bd = 14;
  for (const s of registry) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? best.h : DESK_SEAT_HEIGHT;
}
