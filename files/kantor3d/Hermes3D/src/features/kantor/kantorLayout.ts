/**
 * kantorLayout.ts — Denah Dojo Kantor Jujutsu Kaisen (Foto 2 & 3)
 * Menampilkan:
 * 1. Pimpinan: Ruang Bos Gojo Satoru & Ruang CEO Geto Suguru
 * 2. Ruang Rapat Besar (Boardroom) 20+ kursi rapat
 * 3. Courtyard Zen Garden: Kolam Koi, Jembatan Kayu, Pohon Sakura & Maple Merah
 * 4. Cyber Tech Lab: Server Racks Neon Biru & Workstations
 * 5. Game & Recreation Room: Meja Biliar & Tenis Meja (Pingpong)
 * 6. Batu Prasasti Nama Perusahaan Dinamis di depan gerbang kanan bawah
 */

import type { FurnitureItem } from "@/features/retro-office/core/types";
import type { KantorAgent } from "./kantorApi";
import { chairSeatPoint } from "./kantorSeats";

// Ruang rapat besar (x 684..1092, y 0..226)
export function buildMeetingRoomItems(n: number): FurnitureItem[] {
  const perSide = Math.max(1, Math.ceil(Math.max(0, n - 2) / 2));
  const MAX_PER_ROW = 10;
  const rows = Math.ceil(perSide / MAX_PER_ROW);
  const perRow = Math.ceil(perSide / rows);
  const X0 = 780, X1 = 1050;
  const spacing = Math.min(40, (X1 - X0) / perRow);
  const tableW = Math.round(perRow * spacing);
  const tableX = Math.round(X0 + (X1 - X0 - tableW) / 2);
  const tableY = 88, tableH = 50;
  const out: FurnitureItem[] = [
    { _uid: "rapat_meja", type: "meeting_table", x: tableX, y: tableY, w: tableW, h: tableH },
    { _uid: "rapat_layar", type: "presentation_screen", x: Math.round(tableX + tableW / 2 - 70), y: 2, w: 140, h: 4 },
  ];
  // Kursi kepala barat = Gojo Satoru (Bos), timur = Geto Suguru (CEO)
  const chairAt = (uid: string, sx: number, sy: number, facing: number) => {
    const off = chairSeatPoint({ _uid: uid, type: "chair", x: 0, y: 0, facing })!;
    out.push({ _uid: uid, type: "chair", x: Math.round((sx - off.x) * 10) / 10, y: Math.round((sy - off.y) * 10) / 10, facing });
  };
  chairAt("rapat_kepala_barat", tableX - 20, tableY + tableH / 2, 90);
  chairAt("rapat_kepala_timur", tableX + tableW + 20, tableY + tableH / 2, 270);
  for (let k = 0; k < perSide; k++) {
    const r = Math.floor(k / perRow), i = k % perRow;
    const sx = tableX + spacing * (i + 0.5);
    chairAt(`rapat_kursi_u${k}`, sx, tableY - 18 - r * 34, 0);
    chairAt(`rapat_kursi_s${k}`, sx, tableY + tableH + 18 + r * 34, 180);
  }
  return out;
}

type RapatSeat = { x: number; y: number; facing: number; head?: boolean };
export function getRapatHeads(items: FurnitureItem[]): RapatSeat[] {
  return ["rapat_kepala_barat", "rapat_kepala_timur"].flatMap((uid) => {
    const it = items.find((i) => i._uid === uid);
    const s = it ? chairSeatPoint(it) : null;
    return s ? [{ x: s.x, y: s.y, facing: s.facing, head: true }] : [];
  });
}

export function getRapatSideSeats(items: FurnitureItem[]): RapatSeat[] {
  return items
    .filter((i) => i._uid.startsWith("rapat_kursi_"))
    .map((i) => ({ i, k: parseInt(i._uid.slice(13), 10), s: i._uid[12] === "s" ? 1 : 0 }))
    .sort((a, b) => a.k - b.k || a.s - b.s)
    .flatMap(({ i }) => { const s = chairSeatPoint(i); return s ? [{ x: s.x, y: s.y, facing: s.facing }] : []; });
}

export interface PodDeskSlot {
  uid: string;
  chairUid: string;
  assignedAgentName: string;
  podName: "penjualan" | "pemasaran" | "keuangan" | "operasional";
  deskX: number;
  deskY: number;
  chairX: number;
  chairY: number;
  chairFacing: number;
}

// 1. DINDING DAN PINTU RUANGAN UTARA (y: 226)
export const ROOM_WALL_ITEMS: FurnitureItem[] = [
  // Ruang Bos Gojo Satoru (x: 0..356)
  { _uid: "wall_top_b1", type: "wall", x: 0, y: 226, w: 270, h: 8 },
  { _uid: "door_boss", type: "door", x: 270, y: 226, w: 70, h: 8 },
  { _uid: "wall_top_b2", type: "wall", x: 340, y: 226, w: 20, h: 8 },

  // Ruang CEO Geto Suguru (x: 360..676)
  { _uid: "wall_top_c1", type: "wall", x: 360, y: 226, w: 230, h: 8 },
  { _uid: "door_ceo", type: "door", x: 590, y: 226, w: 70, h: 8 },
  { _uid: "wall_top_c2", type: "wall", x: 660, y: 226, w: 20, h: 8 },

  // Ruang Rapat Besar (x: 680..1092)
  { _uid: "wall_top_m1", type: "wall", x: 680, y: 226, w: 20, h: 8 },
  { _uid: "door_meeting", type: "door", x: 700, y: 226, w: 70, h: 8 },
  { _uid: "wall_top_m2", type: "wall", x: 770, y: 226, w: 322, h: 8 },

  // Partisi Vertikal
  { _uid: "part_boss_ceo", type: "wall", x: 356, y: 0, w: 8, h: 226 },
  { _uid: "part_ceo_meet", type: "wall", x: 676, y: 0, w: 8, h: 226 },

  // Partisi Tech Lab Timur (x 720..1092)
  { _uid: "wall_tech_v", type: "wall", x: 730, y: 234, w: 8, h: 320 },
];

// 2. RUANG BOS GOJO SATORU (x 0..356, y 0..226)
export const BOSS_CABIN_ITEMS: FurnitureItem[] = [
  { _uid: "boss_bookshelf", type: "bookshelf", x: 10, y: 15, w: 80, h: 40 },
  { _uid: "boss_flag", type: "plant", x: 320, y: 20 },
  { _uid: "boss_plant", type: "plant", x: 20, y: 175 },
  { _uid: "boss_desk", type: "executive_desk", x: 82, y: -39, facing: 270 },
  { _uid: "boss_monitor", type: "computer", x: 162, y: 73, facing: 180, elevation: 0.12 },
  { _uid: "boss_chair", type: "exec_chair", x: 165, y: 80, facing: 0 },
  { _uid: "boss_guest_1", type: "guest_chair", x: 128, y: 113, facing: 180 },
  { _uid: "boss_guest_2", type: "guest_chair", x: 198, y: 113, facing: 180 },
];

// 3. RUANG CEO GETO SUGURU (x 364..676, y 0..226)
export const CEO_ROOM_ITEMS: FurnitureItem[] = [
  { _uid: "ceo_bookshelf", type: "bookshelf", x: 370, y: 15, w: 80, h: 40 },
  { _uid: "ceo_plant", type: "plant", x: 640, y: 5 },
  { _uid: "ceo_desk", type: "executive_desk", x: 432, y: -39, facing: 270 },
  { _uid: "ceo_monitor", type: "computer", x: 512, y: 73, facing: 180, elevation: 0.12 },
  { _uid: "ceo_chair", type: "exec_chair", x: 515, y: 80, facing: 0 },
  { _uid: "ceo_guest_1", type: "guest_chair", x: 478, y: 113, facing: 180 },
  { _uid: "ceo_guest_2", type: "guest_chair", x: 548, y: 113, facing: 180 },
];

// 4. WORK DESK SLOTS (Karyawan Jujutsu Kaisen)
export const WORK_DESK_SLOTS: PodDeskSlot[] = [
  // Kolom 1 (Barat)
  { uid: "desk_jjk_1", chairUid: "chair_jjk_1", assignedAgentName: "Yuta Okkotsu", podName: "penjualan", deskX: 20, deskY: 280, chairX: 40, chairY: 270, chairFacing: 180 },
  { uid: "desk_jjk_2", chairUid: "chair_jjk_2", assignedAgentName: "Ijichi", podName: "penjualan", deskX: 130, deskY: 280, chairX: 150, chairY: 270, chairFacing: 180 },
  { uid: "desk_jjk_3", chairUid: "chair_jjk_3", assignedAgentName: "Yuji Itadori", podName: "penjualan", deskX: 240, deskY: 280, chairX: 260, chairY: 270, chairFacing: 180 },

  // Kolom 2
  { uid: "desk_jjk_4", chairUid: "chair_jjk_4", assignedAgentName: "Nobara Kugisaki", podName: "penjualan", deskX: 20, deskY: 380, chairX: 40, chairY: 370, chairFacing: 180 },
  { uid: "desk_jjk_5", chairUid: "chair_jjk_5", assignedAgentName: "Nanami Kento", podName: "penjualan", deskX: 130, deskY: 380, chairX: 150, chairY: 370, chairFacing: 180 },
  { uid: "desk_jjk_6", chairUid: "chair_jjk_6", assignedAgentName: "Todo Aoi", podName: "pemasaran", deskX: 240, deskY: 380, chairX: 260, chairY: 370, chairFacing: 180 },

  // Kolom 3
  { uid: "desk_jjk_7", chairUid: "chair_jjk_7", assignedAgentName: "Hakari Kinji", podName: "pemasaran", deskX: 20, deskY: 480, chairX: 40, chairY: 470, chairFacing: 180 },
  { uid: "desk_jjk_8", chairUid: "chair_jjk_8", assignedAgentName: "Panda", podName: "pemasaran", deskX: 130, deskY: 480, chairX: 150, chairY: 470, chairFacing: 180 },
  { uid: "desk_jjk_9", chairUid: "chair_jjk_9", assignedAgentName: "Inumaki Toge", podName: "pemasaran", deskX: 240, deskY: 480, chairX: 260, chairY: 470, chairFacing: 180 },

  // Kolom 4
  { uid: "desk_jjk_10", chairUid: "chair_jjk_10", assignedAgentName: "Megumi Fushiguro", podName: "pemasaran", deskX: 20, deskY: 570, chairX: 40, chairY: 560, chairFacing: 180 },
  { uid: "desk_jjk_11", chairUid: "chair_jjk_11", assignedAgentName: "Maki Zenin", podName: "keuangan", deskX: 130, deskY: 570, chairX: 150, chairY: 560, chairFacing: 180 },
  { uid: "desk_jjk_12", chairUid: "chair_jjk_12", assignedAgentName: "Mei Mei", podName: "keuangan", deskX: 240, deskY: 570, chairX: 260, chairY: 560, chairFacing: 180 },
];

// 5. COURTYARD ZEN GARDEN (Taman Kolam Koi & Pohon Sakura/Maple Tengah - Foto 2 & 3)
export const COURTYARD_ITEMS: FurnitureItem[] = [
  { _uid: "zen_koi_pond", type: "koi_pond", x: 410, y: 300, w: 260, h: 200 },
  { _uid: "zen_bridge", type: "zen_bridge", x: 500, y: 370, w: 80, h: 45, facing: 90 },
  { _uid: "zen_sakura_1", type: "sakura_tree", x: 620, y: 440 },
  { _uid: "zen_maple_1", type: "maple_tree", x: 415, y: 310 },
  { _uid: "zen_table", type: "table_rect", x: 615, y: 330, w: 45, h: 45 },
  { _uid: "zen_chair_1", type: "chair", x: 615, y: 305, facing: 0 },
  { _uid: "zen_chair_2", type: "chair", x: 615, y: 380, facing: 180 },
];

// 6. TECH LAB / CYBER SERVER ROOM (Timur - Foto 2 & 3)
export const CYBER_TECH_ITEMS: FurnitureItem[] = [
  { _uid: "cyber_rack_1", type: "cyber_server_rack", x: 770, y: 280, w: 40, h: 30 },
  { _uid: "cyber_rack_2", type: "cyber_server_rack", x: 825, y: 280, w: 40, h: 30 },
  { _uid: "cyber_rack_3", type: "cyber_server_rack", x: 880, y: 280, w: 40, h: 30 },
  { _uid: "cyber_rack_4", type: "cyber_server_rack", x: 935, y: 280, w: 40, h: 30 },
  { _uid: "cyber_lab_desk", type: "meeting_table", x: 810, y: 380, w: 160, h: 50 },
  { _uid: "cyber_chair_1", type: "chair", x: 840, y: 440, facing: 180 },
  { _uid: "cyber_chair_2", type: "chair", x: 920, y: 440, facing: 180 },
];

// 7. GAME & GYM ROOM (Selatan Barat - Foto 2)
export const GAME_ROOM_ITEMS: FurnitureItem[] = [
  { _uid: "game_pingpong", type: "pingpong_table", x: 60, y: 650, w: 80, h: 45 },
  { _uid: "game_billiard", type: "billiard_table", x: 180, y: 650, w: 80, h: 45 },
];

// 8. BATU PRASASTI NAMA PERUSAHAAN DINAMIS (Foto 2 - Depan Gerbang Kanan Bawah)
export const FRONT_GATE_ITEMS: FurnitureItem[] = [
  { _uid: "company_name_stone", type: "company_stone", x: 790, y: 720, w: 80, h: 45, facing: 0 },
];

export function applyKantorLayout(items: FurnitureItem[], seatCount = 20): FurnitureItem[] {
  const out: FurnitureItem[] = items.filter(
    (it) => it.x >= 1092 || it.y >= 800
  );

  ROOM_WALL_ITEMS.forEach((it) => out.push({ ...it }));
  BOSS_CABIN_ITEMS.forEach((it) => out.push({ ...it }));
  CEO_ROOM_ITEMS.forEach((it) => out.push({ ...it }));
  buildMeetingRoomItems(seatCount).forEach((it) => out.push(it));
  COURTYARD_ITEMS.forEach((it) => out.push({ ...it }));
  CYBER_TECH_ITEMS.forEach((it) => out.push({ ...it }));
  GAME_ROOM_ITEMS.forEach((it) => out.push({ ...it }));
  FRONT_GATE_ITEMS.forEach((it) => out.push({ ...it }));

  WORK_DESK_SLOTS.forEach((slot) => {
    out.push({
      _uid: slot.uid,
      type: "desk_cubicle",
      x: slot.deskX,
      y: slot.deskY,
      facing: 0,
    });
    out.push({
      _uid: slot.chairUid,
      type: "chair",
      x: slot.chairX,
      y: slot.chairY,
      facing: slot.chairFacing,
    });
  });

  return out;
}

export function autoAssignDesks(params: {
  deskItems: FurnitureItem[];
  explicit: Record<string, number>;
  agentIds: string[];
  overview: KantorAgent[];
}): Record<string, number> {
  const { deskItems, explicit, agentIds, overview } = params;
  const result: Record<string, number> = { ...explicit };

  const deskIndexBySlotUid = new Map<string, number>();
  deskItems.forEach((item, idx) => {
    deskIndexBySlotUid.set(item._uid, idx);
  });

  const byId = new Map(overview.map((a) => [a.id, a]));

  for (const agentId of agentIds) {
    if (result[agentId] !== undefined) continue;
    const agent = byId.get(agentId);
    const name = (agent?.name ?? "").toLowerCase();

    // Gojo (Bos) & Geto (CEO) punya ruangan sendiri di utara, tidak menempati meja staf
    if (agent?.role === "ceo" || /geto|gojo|arga/i.test(name)) continue;

    const matchedSlot = WORK_DESK_SLOTS.find((slot) =>
      name.includes(slot.assignedAgentName.toLowerCase())
    );

    if (matchedSlot) {
      const idx = deskIndexBySlotUid.get(matchedSlot.uid);
      if (idx !== undefined && !Object.values(result).includes(idx)) {
        result[agentId] = idx;
      }
    }
  }

  const seen = new Set<number>();
  for (const agentId of agentIds) {
    const idx = result[agentId];
    if (idx === undefined) continue;
    if (seen.has(idx)) delete result[agentId];
    else seen.add(idx);
  }

  return result;
}
