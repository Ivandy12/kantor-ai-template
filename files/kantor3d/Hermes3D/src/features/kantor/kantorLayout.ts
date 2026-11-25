/**
 * kantorLayout.ts — Denah Baru Kantor AI (BRIEF-ANTIGRAVITY-5 Tahap 5.1 & Revisi R1-R5)
 * Area Utama: x 0..1092, y 0..720
 * 0 Overlap 3D Bounding Box, jarak antar objek >= 10, jarak dinding >= 8, pintu >= 70, lorong >= 90/80.
 */

import type { FurnitureItem } from "@/features/retro-office/core/types";
import type { KantorAgent } from "./kantorApi";
import { chairSeatPoint } from "./kantorSeats";

// Claude ruang-rapat: ruang rapat (x 684..1092, y 0..226) dibangun sesuai jumlah agent.
// Kursi samping = n-2 (dibagi utara/selatan), kursi kepala barat = Pak Fauzy, timur = Arga, layar di dinding utara.
// Sisi barat dekat pintu (x<760) dibiarkan kosong buat jalan masuk.
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
  // taruh kursi supaya PUSAT DUDUKANNYA tepat di (sx, sy) — model kursi dipasang dari pojok item
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
/** [kepala barat (Pak Fauzy), kepala timur (Arga)] */
export function getRapatHeads(items: FurnitureItem[]): RapatSeat[] {
  return ["rapat_kepala_barat", "rapat_kepala_timur"].flatMap((uid) => {
    const it = items.find((i) => i._uid === uid);
    const s = it ? chairSeatPoint(it) : null;
    return s ? [{ x: s.x, y: s.y, facing: s.facing, head: true }] : [];
  });
}
/** Kursi samping urut u0, s0, u1, s1, … (barat ke timur, selang-seling utara/selatan). */
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
  podName: "meta" | "kreatif" | "tech";
  deskX: number;
  deskY: number;
  chairX: number;
  chairY: number;
  chairFacing: number;
}

// 1. DINDING DAN PINTU RUANGAN ATAS (y: 226, w: 8, pintu: 70)
export const ROOM_WALL_ITEMS: FurnitureItem[] = [
  // Boss Cabin door & walls (x: 0..356)
  { _uid: "wall_top_b1", type: "wall", x: 0, y: 226, w: 270, h: 8 },
  { _uid: "door_boss", type: "door", x: 270, y: 226, w: 70, h: 8 },
  { _uid: "wall_top_b2", type: "wall", x: 340, y: 226, w: 20, h: 8 },

  // Ruang CEO door & walls (x: 360..676)
  { _uid: "wall_top_c1", type: "wall", x: 360, y: 226, w: 230, h: 8 },
  { _uid: "door_ceo", type: "door", x: 590, y: 226, w: 70, h: 8 },
  { _uid: "wall_top_c2", type: "wall", x: 660, y: 226, w: 20, h: 8 },

  // Ruang Rapat door & walls (x: 680..1092)
  { _uid: "wall_top_m1", type: "wall", x: 680, y: 226, w: 20, h: 8 },
  { _uid: "door_meeting", type: "door", x: 700, y: 226, w: 70, h: 8 },
  { _uid: "wall_top_m2", type: "wall", x: 770, y: 226, w: 322, h: 8 },

  // Partisi Vertikal
  { _uid: "part_boss_ceo", type: "wall", x: 356, y: 0, w: 8, h: 226 },
  { _uid: "part_ceo_meet", type: "wall", x: 676, y: 0, w: 8, h: 226 },
];

// 2. BOSS CABIN (x 0..356, y 0..226)
export const BOSS_CABIN_ITEMS: FurnitureItem[] = [
  { _uid: "boss_bookshelf", type: "bookshelf", x: 10, y: 15, w: 80, h: 40 },
  { _uid: "boss_flag", type: "plant", x: 320, y: 20 },
  { _uid: "boss_plant", type: "plant", x: 20, y: 175 },
  // Claude fix16: meja L diputar 180 (bos di sudut dalam, meja di depan), kursi & monitor menghadap benar
  { _uid: "boss_desk", type: "executive_desk", x: 82, y: -39, facing: 270 },
  { _uid: "boss_monitor", type: "computer", x: 162, y: 73, facing: 180, elevation: 0.12 },
  { _uid: "boss_chair", type: "exec_chair", x: 165, y: 80, facing: 0 },
  { _uid: "boss_guest_1", type: "guest_chair", x: 128, y: 113, facing: 180 },
  { _uid: "boss_guest_2", type: "guest_chair", x: 198, y: 113, facing: 180 },
];

// 3. RUANG CEO (x 364..676, y 0..226)
export const CEO_ROOM_ITEMS: FurnitureItem[] = [
  { _uid: "ceo_bookshelf", type: "bookshelf", x: 370, y: 15, w: 80, h: 40 },
  { _uid: "ceo_plant", type: "plant", x: 640, y: 5 },
  // Claude fix16: meja L diputar 180 (bos di sudut dalam, meja di depan), kursi & monitor menghadap benar
  { _uid: "ceo_desk", type: "executive_desk", x: 432, y: -39, facing: 270 },
  { _uid: "ceo_monitor", type: "computer", x: 512, y: 73, facing: 180, elevation: 0.12 },
  { _uid: "ceo_chair", type: "exec_chair", x: 515, y: 80, facing: 0 },
  { _uid: "ceo_guest_1", type: "guest_chair", x: 478, y: 113, facing: 180 },
  { _uid: "ceo_guest_2", type: "guest_chair", x: 548, y: 113, facing: 180 },
];

// 4. RUANG RAPAT (x 684..1092, y 0..226)
export const MEETING_ROOM_ITEMS: FurnitureItem[] = [
  { _uid: "meeting_table", type: "table_rect", x: 790, y: 95, w: 240, h: 60 },
  { _uid: "meeting_chair_n1", type: "chair", x: 830, y: 38, facing: 0 },
  { _uid: "meeting_chair_n2", type: "chair", x: 910, y: 38, facing: 0 },
  { _uid: "meeting_chair_n3", type: "chair", x: 990, y: 38, facing: 0 },
  { _uid: "meeting_chair_s1", type: "chair", x: 830, y: 155, facing: 180 },
  { _uid: "meeting_chair_s2", type: "chair", x: 910, y: 155, facing: 180 },
  { _uid: "meeting_chair_s3", type: "chair", x: 990, y: 155, facing: 180 },
  { _uid: "meeting_chair_w", type: "chair", x: 735, y: 95, facing: 90 },
];

// 5. AREA KERJA UTAMA (16 meja kubikel, R1: jarak kolom 130, baris 300/350/410/460)
export const WORK_DESK_SLOTS: PodDeskSlot[] = [
  // Claude fix: konvensi meja asli Hermes3D (kursi bawaan di sisi utara, titik duduk x+40,y-5), baris A y=320, B y=470
  { uid: "desk_meta_a1", chairUid: "chair_meta_a1", assignedAgentName: "Bima", podName: "meta", deskX: 20, deskY: 320, chairX: 40, chairY: 310, chairFacing: 180 },
  { uid: "desk_meta_a2", chairUid: "chair_meta_a2", assignedAgentName: "AM Edio", podName: "meta", deskX: 140, deskY: 320, chairX: 160, chairY: 310, chairFacing: 180 },
  { uid: "desk_meta_a3", chairUid: "chair_meta_a3", assignedAgentName: "AM Fauzy", podName: "meta", deskX: 260, deskY: 320, chairX: 280, chairY: 310, chairFacing: 180 },
  { uid: "desk_meta_b1", chairUid: "chair_meta_b1", assignedAgentName: "AM Maikha", podName: "meta", deskX: 20, deskY: 470, chairX: 40, chairY: 460, chairFacing: 180 },
  { uid: "desk_meta_b2", chairUid: "chair_meta_b2", assignedAgentName: "AM Nurrahman", podName: "meta", deskX: 140, deskY: 470, chairX: 160, chairY: 460, chairFacing: 180 },
  { uid: "desk_meta_b3", chairUid: "chair_meta_b3", assignedAgentName: "AM Zacky", podName: "meta", deskX: 260, deskY: 470, chairX: 280, chairY: 460, chairFacing: 180 },
  { uid: "desk_kreatif_a1", chairUid: "chair_kreatif_a1", assignedAgentName: "Sekar", podName: "kreatif", deskX: 440, deskY: 320, chairX: 460, chairY: 310, chairFacing: 180 },
  { uid: "desk_kreatif_a2", chairUid: "chair_kreatif_a2", assignedAgentName: "Laras", podName: "kreatif", deskX: 560, deskY: 320, chairX: 580, chairY: 310, chairFacing: 180 },
  { uid: "desk_kreatif_b1", chairUid: "chair_kreatif_b1", assignedAgentName: "Bayu", podName: "kreatif", deskX: 440, deskY: 470, chairX: 460, chairY: 460, chairFacing: 180 },
  { uid: "desk_kreatif_b2", chairUid: "chair_kreatif_b2", assignedAgentName: "Cadangan Kreatif", podName: "kreatif", deskX: 560, deskY: 470, chairX: 580, chairY: 460, chairFacing: 180 },
  { uid: "desk_tech_a1", chairUid: "chair_tech_a1", assignedAgentName: "Gatot", podName: "tech", deskX: 740, deskY: 320, chairX: 760, chairY: 310, chairFacing: 180 },
  { uid: "desk_tech_a2", chairUid: "chair_tech_a2", assignedAgentName: "Dimas", podName: "tech", deskX: 860, deskY: 320, chairX: 880, chairY: 310, chairFacing: 180 },
  { uid: "desk_tech_a3", chairUid: "chair_tech_a3", assignedAgentName: "Raka", podName: "tech", deskX: 980, deskY: 320, chairX: 1000, chairY: 310, chairFacing: 180 },
  { uid: "desk_tech_b1", chairUid: "chair_tech_b1", assignedAgentName: "Radit", podName: "tech", deskX: 740, deskY: 470, chairX: 760, chairY: 460, chairFacing: 180 },
  { uid: "desk_tech_b2", chairUid: "chair_tech_b2", assignedAgentName: "Rani", podName: "tech", deskX: 860, deskY: 470, chairX: 880, chairY: 460, chairFacing: 180 },
  { uid: "desk_tech_b3", chairUid: "chair_tech_b3", assignedAgentName: "Cadangan Tech", podName: "tech", deskX: 980, deskY: 470, chairX: 1000, chairY: 460, chairFacing: 180 },
];

// 6. AREA BAWAH TERBUKA (y 560..720)
// Claude v1.3: kursi ditaruh supaya PUSAT DUDUKANNYA tepat di (sx, sy) — sama seperti ruang rapat
function chairAtSeat(uid: string, sx: number, sy: number, facing: number): FurnitureItem {
  const off = chairSeatPoint({ _uid: uid, type: "chair", x: 0, y: 0, facing })!;
  return { _uid: uid, type: "chair", x: Math.round((sx - off.x) * 10) / 10, y: Math.round((sy - off.y) * 10) / 10, facing };
}
// Pantry: meja setinggi meja kerja (0,74 m; meja kopi lama cuma 0,39 m -> lutut nembus) + 2 kursi menghadap meja
const PANTRY_TABLE = { x: 880, y: 616, w: 90, h: 40 };
const PANTRY_CHAIRS: FurnitureItem[] = [
  chairAtSeat("pantry_c1", PANTRY_TABLE.x + 23, PANTRY_TABLE.y - 18, 0),
  chairAtSeat("pantry_c2", PANTRY_TABLE.x + 67, PANTRY_TABLE.y - 18, 0),
];
export const PANTRY_SEATS = PANTRY_CHAIRS.map((c) => {
  const p = chairSeatPoint(c)!;
  return { x: p.x, y: p.y, facing: p.facing, sit: true };
});
// Lounge: sofa menempel dinding selatan, MENGHADAP ke kantor (utara) supaya didekati dari depan, meja kopi di samping.
// (dulu meja di dalam sofa & 2 sofa tumpang tindih). Model sofa: facing 0 = sandaran di selatan, dudukan menghadap utara.
// sofa couch facing 0 di (378,619): wujud x 380..478, y 659..700
export const LOUNGE_SEATS = [
  { x: 407, y: 675, facing: Math.PI, sit: true },
  { x: 451, y: 675, facing: Math.PI, sit: true },
];

export const BOTTOM_AREA_ITEMS: FurnitureItem[] = [
  // RESEPSIONIS
  { _uid: "reception_desk", type: "table_rect", x: 100, y: 620, w: 120, h: 60 },
  { _uid: "reception_chair", type: "chair", x: 140, y: 600, facing: 180 },

  // LOUNGE
  { _uid: "lounge_sofa_1", type: "couch", x: 378, y: 619, facing: 0 },
  { _uid: "lounge_table", type: "table_rect", x: 492, y: 700, w: 60, h: 30 },
  { _uid: "lounge_sofa_3", type: "couch_v", x: 540, y: 645, facing: 270 },
  { _uid: "lounge_lamp", type: "lamp", x: 600, y: 590 },

  // PANTRY
  { _uid: "pantry_fridge", type: "fridge", x: 740, y: 695 },
  { _uid: "pantry_coffee", type: "coffee_machine", x: 800, y: 695 },
  { _uid: "pantry_cooler", type: "water_cooler", x: 1050, y: 695 },
  { _uid: "pantry_table", type: "meeting_table", ...PANTRY_TABLE },
  ...PANTRY_CHAIRS,
];

export function applyKantorLayout(items: FurnitureItem[], seatCount = 17): FurnitureItem[] {
  const out: FurnitureItem[] = items.filter(
    (it) => it.x >= 1092 || it.y >= 720
  );

  ROOM_WALL_ITEMS.forEach((it) => out.push({ ...it }));
  BOSS_CABIN_ITEMS.forEach((it) => out.push({ ...it }));
  CEO_ROOM_ITEMS.forEach((it) => out.push({ ...it }));
  buildMeetingRoomItems(seatCount).forEach((it) => out.push(it)); // Claude ruang-rapat (dulu MEETING_ROOM_ITEMS 7 kursi)

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

  BOTTOM_AREA_ITEMS.forEach((it) => out.push({ ...it }));

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

    if (agent?.role === "ceo" || /arga/i.test(name)) continue;

    const matchedSlot = WORK_DESK_SLOTS.find((slot) =>
      name.includes(slot.assignedAgentName.toLowerCase())
    );

    if (matchedSlot) {
      const idx = deskIndexBySlotUid.get(matchedSlot.uid);
      // Claude v1.3: meja yang sudah dipakai agent lain tidak boleh dobel (dulu 2 agent duduk di 1 kursi)
      if (idx !== undefined && !Object.values(result).includes(idx)) {
        result[agentId] = idx;
      }
    }
  }

  // buang dobel dari penugasan tersimpan: agent kedua di meja yang sama dicarikan meja kosong
  const seen = new Set<number>();
  for (const agentId of agentIds) {
    const idx = result[agentId];
    if (idx === undefined) continue;
    if (seen.has(idx)) delete result[agentId];
    else seen.add(idx);
  }

  const used = new Set(Object.values(result));
  const emptySlots = WORK_DESK_SLOTS
    .map((s) => deskIndexBySlotUid.get(s.uid))
    .filter((idx): idx is number => idx !== undefined && !used.has(idx));

  for (const agentId of agentIds) {
    if (result[agentId] !== undefined) continue;
    const agent = byId.get(agentId);
    const name = (agent?.name ?? "").toLowerCase();
    if (agent?.role === "ceo" || /arga/i.test(name)) continue;

    const nextFree = emptySlots.shift();
    if (nextFree !== undefined) {
      result[agentId] = nextFree;
    }
  }

  return result;
}
