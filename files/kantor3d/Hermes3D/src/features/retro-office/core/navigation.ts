import { getRapatSideSeats } from "@/features/kantor/kantorLayout"; // Claude ruang-rapat
import { AGENT_BODY_R, CHAIR_TYPES, setSolids, visualRect, type Rect as SolidRect } from "@/features/kantor/kantorSolids"; // Claude anti-tembus
import {
  AGENT_RADIUS,
  CANVAS_H,
  CANVAS_W,
} from "@/features/retro-office/core/constants";
import {
  getItemBounds,
  ITEM_FOOTPRINT,
  ITEM_METADATA,
  snap,
} from "@/features/retro-office/core/geometry";
import type {
  FacingPoint,
  FurnitureItem,
  GymWorkoutLocation,
  QaLabStationLocation,
} from "@/features/retro-office/core/types";
export {
  GYM_DEFAULT_TARGET,
  resolveGymRoute,
} from "@/features/retro-office/core/navigation/gymRoute";
export { getJanitorCleaningStops } from "@/features/retro-office/core/navigation/janitorStops";
export {
  resolveSmsBoothRoute,
  SMS_BOOTH_DEFAULT_TARGET,
} from "@/features/retro-office/core/navigation/smsBoothRoute";
export {
  PHONE_BOOTH_DEFAULT_TARGET,
  resolvePhoneBoothRoute,
} from "@/features/retro-office/core/navigation/phoneBoothRoute";
export {
  QA_LAB_DEFAULT_TARGET,
  resolveQaLabRoute,
} from "@/features/retro-office/core/navigation/qaLabRoute";
export {
  resolveServerRoomRoute,
  SERVER_ROOM_TARGET,
} from "@/features/retro-office/core/navigation/serverRoomRoute";

export const resolvePingPongTargets = (
  item: FurnitureItem,
): [FacingPoint, FacingPoint] => {
  const width = item.w ?? 100;
  const depth = item.h ?? 60;
  const centerY = snap(item.y + depth / 2);
  return [
    { x: snap(item.x - 40), y: centerY, facing: Math.PI / 2 },
    { x: snap(item.x + width + 20), y: centerY, facing: -Math.PI / 2 },
  ];
};

export const ROAM_POINTS = [
  { x: 800, y: 200 },
  { x: 850, y: 500 },
  { x: 820, y: 580 },
  { x: 450, y: 420 },
  { x: 250, y: 420 },
  { x: 650, y: 420 },
  { x: 150, y: 620 },
];

export const JANITOR_ENTRY_POINTS: FacingPoint[] = [
  { x: 80, y: 360, facing: Math.PI / 2 },
  { x: 820, y: 70, facing: Math.PI },
  { x: 1540, y: 360, facing: -Math.PI / 2 },
];

export const JANITOR_EXIT_POINTS: FacingPoint[] = [
  { x: 110, y: 680, facing: Math.PI / 2 },
  { x: 820, y: 680, facing: Math.PI },
  { x: 1510, y: 680, facing: -Math.PI / 2 },
];

const GRID_CELL = 10; // Claude grid-halus: dulu 25px, terlalu kasar (kursi & lorong ketutup)
const GRID_COLS = Math.ceil(CANVAS_W / GRID_CELL);
const GRID_ROWS = Math.ceil(CANVAS_H / GRID_CELL);

export type NavGrid = Uint8Array;

/**
 * Returns true if the given item type should block pathfinding cells.
 * Driven by ITEM_METADATA.blocksNavigation — the single source of truth for
 * nav-blocking behaviour. Unknown types default to false (non-blocking) so
 * newly added decorative items never accidentally block navigation.
 */
const itemBlocksNavigation = (type: string): boolean =>
  ITEM_METADATA[type]?.blocksNavigation ?? false;

export function buildNavGrid(furniture: FurnitureItem[]): NavGrid {
  const grid = new Uint8Array(GRID_COLS * GRID_ROWS);
  const defaultPad = AGENT_BODY_R; // Claude grid-halus
  const solidList: SolidRect[] = []; // Claude anti-tembus: wujud yang kelihatan, buat tes tembus
  for (const item of furniture) {
    if (!itemBlocksNavigation(item.type) && !CHAIR_TYPES.has(item.type)) continue; // Claude anti-tembus: kursi juga padat
    const itemPad = ITEM_METADATA[item.type]?.navPadding ?? defaultPad;
    const bounds = getItemBounds(item);
    let x1 = bounds.x - itemPad;
    let y1 = bounds.y - itemPad;
    let x2 = bounds.x + bounds.w + itemPad;
    let y2 = bounds.y + bounds.h + itemPad;
    if (item.type === "executive_desk") {
      // Claude fix16: model deskCorner.glb (skala 1.92) tidak di tengah footprint -> blokir 2 lengan meja L
      // persis di tempat yang kelihatan, sudut dalam L (tempat duduk bos) tetap bisa dimasuki.
      const rot = ((item.facing ?? 0) * Math.PI) / 180 - Math.PI / 2;
      const cx = item.x + 65;
      const cy = item.y + 32.5;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const arms: Array<[number, number, number, number]> = [
        [0, -103.5, 103.5, -64], // lengan panjang
        [64, -64, 103.5, 19.2], // lengan samping
      ];
      for (const [ax1, ay1, ax2, ay2] of arms) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (const [px, py] of [[ax1, ay1], [ax2, ay1], [ax1, ay2], [ax2, ay2]]) {
          const rx = item.x + px - cx;
          const ry = item.y + py - cy;
          xs.push(cx + rx * cos + ry * sin);
          ys.push(cy - rx * sin + ry * cos);
        }
        solidList.push({ x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys), uid: item._uid, type: item.type });
        const bc1 = Math.max(0, Math.floor((Math.min(...xs) - AGENT_BODY_R) / GRID_CELL));
        const bc2 = Math.min(GRID_COLS - 1, Math.floor((Math.max(...xs) + AGENT_BODY_R - 0.01) / GRID_CELL));
        const br1 = Math.max(0, Math.floor((Math.min(...ys) - AGENT_BODY_R) / GRID_CELL));
        const br2 = Math.min(GRID_ROWS - 1, Math.floor((Math.max(...ys) + AGENT_BODY_R - 0.01) / GRID_CELL));
        for (let row = br1; row <= br2; row += 1) {
          for (let column = bc1; column <= bc2; column += 1) grid[row * GRID_COLS + column] = 1;
        }
      }
      continue;
    }
    // Claude anti-tembus: blok wujud yang kelihatan (model GLB dipasang dari pojok item, bisa geser keluar footprint)
    // ditambah radius badan agent; kursi cuma sedikit dipadding supaya titik duduk di sebelahnya tetap terjangkau.
    const vr = visualRect(item);
    if (vr) {
      // Claude v1.3: kursi dipadding hampir selebar badan (dulu 3px -> orang lewat nembus sandaran kursi orang lain);
      // kursi asal/tujuan tetap bisa dicapai karena dibuka per rencana jalan (openNavCell, radius 32)
      const pad = CHAIR_TYPES.has(item.type) ? 11 : AGENT_BODY_R;
      x1 = vr.x1 - pad; y1 = vr.y1 - pad; x2 = vr.x2 + pad; y2 = vr.y2 + pad;
      solidList.push(vr);
    } else {
      solidList.push({ x1: bounds.x, y1: bounds.y, x2: bounds.x + bounds.w, y2: bounds.y + bounds.h, uid: item._uid, type: item.type });
    }
    const c1 = Math.max(0, Math.floor(x1 / GRID_CELL));
    const c2 = Math.min(GRID_COLS - 1, Math.floor(x2 / GRID_CELL));
    const r1 = Math.max(0, Math.floor(y1 / GRID_CELL));
    const r2 = Math.min(GRID_ROWS - 1, Math.floor(y2 / GRID_CELL));
    for (let row = r1; row <= r2; row += 1) {
      for (let column = c1; column <= c2; column += 1) {
        grid[row * GRID_COLS + column] = 1;
      }
    }
  }

  // Claude anti-tembus: celah kursi meja TIDAK lagi dibuka permanen (bikin orang lewat nembus kursi orang lain);
  // sel kursi awal/tujuan dibuka per rencana jalan di astar() RetroOffice3D.
  for (const item of furniture) {
    if (item.type !== "desk_cubicle" || true) continue;
    const chairX = item.x + 40;
    const chairY = item.y - 5;
    const c1 = Math.max(0, Math.floor((chairX - 8) / GRID_CELL));
    const c2 = Math.min(GRID_COLS - 1, Math.floor((chairX + 8) / GRID_CELL));
    const r1 = Math.max(0, Math.floor((chairY - 8) / GRID_CELL));
    const r2 = Math.min(GRID_ROWS - 1, Math.floor((chairY + 8) / GRID_CELL));
    for (let row = r1; row <= r2; row += 1) {
      for (let column = c1; column <= c2; column += 1) {
        grid[row * GRID_COLS + column] = 0;
      }
    }
  }

  // T6: Pintu - buka celah wall di posisi door agar agent bisa lewat pintu
  for (const item of furniture) {
    if (item.type !== "door") continue;
    const bounds = getItemBounds(item);
    // Claude grid-halus: buka persis lebar pintu dikurangi radius badan (dulu +5px -> nyerempet ujung tembok)
    const horiz = bounds.w >= bounds.h;
    const c1 = Math.max(0, Math.floor((bounds.x + (horiz ? AGENT_BODY_R : -AGENT_BODY_R - 4)) / GRID_CELL));
    const c2 = Math.min(GRID_COLS - 1, Math.floor((bounds.x + bounds.w - (horiz ? AGENT_BODY_R : -AGENT_BODY_R - 4) - 0.01) / GRID_CELL));
    const r1 = Math.max(0, Math.floor((bounds.y + (horiz ? -AGENT_BODY_R - 4 : AGENT_BODY_R)) / GRID_CELL));
    const r2 = Math.min(GRID_ROWS - 1, Math.floor((bounds.y + bounds.h - (horiz ? -AGENT_BODY_R - 4 : AGENT_BODY_R) - 0.01) / GRID_CELL));
    for (let row = r1; row <= r2; row += 1) {
      for (let column = c1; column <= c2; column += 1) {
        grid[row * GRID_COLS + column] = 0;
      }
    }
  }

  for (let column = 0; column < GRID_COLS; column += 1) {
    grid[column] = 1;
    grid[(GRID_ROWS - 1) * GRID_COLS + column] = 1;
  }
  for (let row = 0; row < GRID_ROWS; row += 1) {
    grid[row * GRID_COLS] = 1;
    grid[row * GRID_COLS + GRID_COLS - 1] = 1;
  }
  // Claude pagar-gedung: dinding luar kantor utama (x<1092, y=0..720) digambar terpisah dan nggak ada di daftar furnitur,
  // jadi A* bisa memutar lewat LUAR gedung kalau lorong dalam ketutup (mis. sofa lounge sampai ke dinding selatan).
  const fence = (x1: number, y1: number, x2: number, y2: number) => {
    for (let r = Math.floor(y1 / GRID_CELL); r <= Math.floor((y2 - 0.01) / GRID_CELL) && r < GRID_ROWS; r += 1)
      for (let c = Math.floor(x1 / GRID_CELL); c <= Math.floor((x2 - 0.01) / GRID_CELL) && c < GRID_COLS; c += 1) grid[r * GRID_COLS + c] = 1;
  };
  fence(0, 720 - AGENT_BODY_R, 1092, 1000); // selatan (sampai sebelum zona kantor remote)
  fence(0, 0, 1092, AGENT_BODY_R); // utara
  fence(0, 0, AGENT_BODY_R, 720); // barat
  solidList.push({ x1: 0, y1: 720, x2: 1092, y2: 1000, uid: "pagar_selatan", type: "wall" });
  setSolids(solidList);
  return grid;
}

/** True when the nav cell containing (x, y) is inside the grid and unblocked. */
export const isNavPointFree = (grid: NavGrid, x: number, y: number): boolean => {
  const column = Math.floor(x / GRID_CELL);
  const row = Math.floor(y / GRID_CELL);
  if (column < 0 || column >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
    return false;
  }
  return grid[row * GRID_COLS + column] === 0;
};

/**
 * True when a body of `radius` centred on (x, y) clears every blocked cell.
 *
 * A cell is 25 units and an agent is 40 across, so a point-only check reports
 * "free" for a spot where the agent's body still sinks into the desk in the
 * neighbouring cell. Use this for anywhere an agent comes to a stop and stays
 * visible — walking through a pinch point can tolerate the looser test, but a
 * character standing half inside a desk cannot.
 */
export const isNavAreaFree = (
  grid: NavGrid,
  x: number,
  y: number,
  radius: number = AGENT_RADIUS,
): boolean => {
  const firstColumn = Math.floor((x - radius) / GRID_CELL);
  const lastColumn = Math.floor((x + radius) / GRID_CELL);
  const firstRow = Math.floor((y - radius) / GRID_CELL);
  const lastRow = Math.floor((y + radius) / GRID_CELL);
  if (
    firstColumn < 0 ||
    firstRow < 0 ||
    lastColumn >= GRID_COLS ||
    lastRow >= GRID_ROWS
  ) {
    return false;
  }
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      if (grid[row * GRID_COLS + column] !== 0) return false;
    }
  }
  return true;
};

export function astar(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  grid: NavGrid,
): { x: number; y: number }[] {
  const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, value));
  const toCell = (x: number, y: number) => ({
    c: clamp(Math.floor(x / GRID_CELL), 0, GRID_COLS - 1),
    r: clamp(Math.floor(y / GRID_CELL), 0, GRID_ROWS - 1),
  });
  const cellCx = (column: number) => column * GRID_CELL + GRID_CELL / 2;
  const cellCy = (row: number) => row * GRID_CELL + GRID_CELL / 2;

  const findFree = (column: number, row: number) => {
    if (!grid[row * GRID_COLS + column]) return { c: column, r: row };
    for (let distance = 1; distance < 10; distance += 1) {
      for (let rowOffset = -distance; rowOffset <= distance; rowOffset += 1) {
        for (
          let columnOffset = -distance;
          columnOffset <= distance;
          columnOffset += 1
        ) {
          if (
            Math.abs(rowOffset) !== distance &&
            Math.abs(columnOffset) !== distance
          ) {
            continue;
          }
          const nextRow = row + rowOffset;
          const nextColumn = column + columnOffset;
          if (
            nextRow < 0 ||
            nextRow >= GRID_ROWS ||
            nextColumn < 0 ||
            nextColumn >= GRID_COLS
          ) {
            continue;
          }
          if (!grid[nextRow * GRID_COLS + nextColumn]) {
            return { c: nextColumn, r: nextRow };
          }
        }
      }
    }
    return null;
  };

  let { c: sc, r: sr } = toCell(sx, sy);
  let { c: ec, r: er } = toCell(ex, ey);
  const startFree = findFree(sc, sr);
  const endFree = findFree(ec, er);
  if (!startFree || !endFree) return [];
  sc = startFree.c;
  sr = startFree.r;
  ec = endFree.c;
  er = endFree.r;
  // Same nav cell: start and end are close enough that A* has no grid edges
  // to traverse. The destination is still reachable — return a single-waypoint
  // path to the exact target pixel so the movement layer can make the final
  // fine-grained adjustment instead of staying put.
  if (sc === ec && sr === er) return [{ x: ex, y: ey }];

  const nodeCount = GRID_COLS * GRID_ROWS;
  const gCost = new Float32Array(nodeCount).fill(Infinity);
  const parent = new Int32Array(nodeCount).fill(-1);
  const visited = new Uint8Array(nodeCount);
  const startIndex = sr * GRID_COLS + sc;
  const endIndex = er * GRID_COLS + ec;
  gCost[startIndex] = 0;

  const open: [number, number][] = [];
  const pushOpen = (entry: [number, number]) => {
    open.push(entry);
    let index = open.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (open[parentIndex][1] <= entry[1]) break;
      open[index] = open[parentIndex];
      index = parentIndex;
    }
    open[index] = entry;
  };
  const popOpen = (): [number, number] | null => {
    if (open.length === 0) return null;
    const first = open[0];
    const last = open.pop();
    if (!last || open.length === 0) return first;
    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      if (leftIndex >= open.length) break;
      let smallestIndex = leftIndex;
      if (
        rightIndex < open.length &&
        open[rightIndex][1] < open[leftIndex][1]
      ) {
        smallestIndex = rightIndex;
      }
      if (open[smallestIndex][1] >= last[1]) break;
      open[index] = open[smallestIndex];
      index = smallestIndex;
    }
    open[index] = last;
    return first;
  };
  pushOpen([startIndex, Math.hypot(ec - sc, er - sr)]);
  const directions: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ];

  while (open.length) {
    const next = popOpen();
    if (!next) break;
    const [current] = next;
    if (visited[current]) continue;
    visited[current] = 1;

    if (current === endIndex) {
      const path: { x: number; y: number }[] = [];
      let node = current;
      while (node !== startIndex) {
        path.push({
          x: cellCx(node % GRID_COLS),
          y: cellCy(Math.floor(node / GRID_COLS)),
        });
        node = parent[node];
      }
      path.reverse();
      if (path.length) path[path.length - 1] = { x: ex, y: ey };
      else path.push({ x: ex, y: ey });
      return path;
    }

    const currentColumn = current % GRID_COLS;
    const currentRow = Math.floor(current / GRID_COLS);
    for (const [columnOffset, rowOffset, cost] of directions) {
      const nextColumn = currentColumn + columnOffset;
      const nextRow = currentRow + rowOffset;
      if (
        nextColumn < 0 ||
        nextColumn >= GRID_COLS ||
        nextRow < 0 ||
        nextRow >= GRID_ROWS
      ) {
        continue;
      }
      const nextIndex = nextRow * GRID_COLS + nextColumn;
      if (visited[nextIndex] || grid[nextIndex]) continue;

      // For diagonal moves, require both orthogonal neighbours to be free so
      // agents cannot clip through the corner of a blocked cell (issue #6).
      // E.g. moving NE (dc=+1, dr=-1) requires N (dc=0, dr=-1) and E (dc=+1, dr=0) to be clear.
      if (columnOffset !== 0 && rowOffset !== 0) {
        const orthogonalA =
          (currentRow + rowOffset) * GRID_COLS + currentColumn;
        const orthogonalB =
          currentRow * GRID_COLS + (currentColumn + columnOffset);
        if (grid[orthogonalA] || grid[orthogonalB]) continue;
      }
      const nextCost = gCost[current] + cost;
      if (nextCost < gCost[nextIndex]) {
        gCost[nextIndex] = nextCost;
        parent[nextIndex] = current;
        pushOpen([
          nextIndex,
          nextCost + Math.hypot(ec - nextColumn, er - nextRow),
        ]);
      }
    }
  }

  return [];
}

export const getDeskLocations = (items: FurnitureItem[]) =>
  items
    .filter((item) => item.type === "desk_cubicle")
    .map((item) => ({ x: item.x + 40, y: item.y - 5 }));

export const getMeetingSeatLocations = (items: FurnitureItem[]) => {
  const rapat = getRapatSideSeats(items); // Claude ruang-rapat
  if (rapat.length) return rapat;
  // Meeting seats are inferred from chair placement in the conference area so standup
  // gathering follows the authored layout instead of a hardcoded attendee list.
  const chairs = items
    .filter(
      (item) =>
        item.type === "chair" &&
        item.x >= 0 &&
        item.x <= 290 &&
        item.y >= 0 &&
        item.y <= 235,
    )
    .sort((left, right) => left.y - right.y || left.x - right.x);
  if (chairs.length === 0) return [];

  const chairCenters = chairs.map((item) => ({
    item,
    x: item.x + ITEM_FOOTPRINT.chair[0] / 2,
    y: item.y + ITEM_FOOTPRINT.chair[1] / 2,
  }));
  const centerX =
    chairCenters.reduce((sum, chair) => sum + chair.x, 0) / chairCenters.length;
  const centerY =
    chairCenters.reduce((sum, chair) => sum + chair.y, 0) / chairCenters.length;

  return chairCenters.map((chair) => {
    const offsetX = chair.x - centerX;
    const offsetY = chair.y - centerY;
    const distance = Math.hypot(offsetX, offsetY) || 1;
    const seatPullback = 14;
    return {
      x: chair.x + (offsetX / distance) * seatPullback,
      y: chair.y + (offsetY / distance) * seatPullback,
      facing: Math.atan2(centerX - chair.x, centerY - chair.y),
    };
  });
};

export const getGymWorkoutLocations = (
  items: FurnitureItem[],
): GymWorkoutLocation[] =>
  items
    .filter((item) =>
      [
        "treadmill",
        "weight_bench",
        "dumbbell_rack",
        "exercise_bike",
        "punching_bag",
        "rowing_machine",
        "kettlebell_rack",
        "yoga_mat",
      ].includes(item.type),
    )
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((item) => {
      // Each workout target is an agent standing point plus a facing direction toward equipment.
      const bounds = getItemBounds(item);
      const equipmentCenterX = bounds.x + bounds.w / 2;
      const equipmentCenterY = bounds.y + bounds.h / 2;
      const facingTowardEquipment = (targetX: number, targetY: number) =>
        Math.atan2(equipmentCenterX - targetX, equipmentCenterY - targetY);
      if (item.type === "treadmill") {
        const x = item.x + 35;
        const y = item.y + 65;
        return {
          x,
          y,
          facing: facingTowardEquipment(x, y),
          workoutStyle: "run",
        };
      }
      if (item.type === "weight_bench") {
        const x = item.x + 38;
        const y = item.y + 20;
        return {
          x,
          y,
          facing: facingTowardEquipment(x, y),
          workoutStyle: "lift",
        };
      }
      if (item.type === "dumbbell_rack" || item.type === "kettlebell_rack") {
        const x = item.x - 18;
        const y = item.y + 14;
        return {
          x,
          y,
          facing: facingTowardEquipment(x, y),
          workoutStyle: "lift",
        };
      }
      if (item.type === "exercise_bike") {
        const x = item.x + 18;
        const y = item.y + 28;
        return {
          x,
          y,
          facing: facingTowardEquipment(x, y),
          workoutStyle: "bike",
        };
      }
      if (item.type === "rowing_machine") {
        const x = item.x + 28;
        const y = item.y + 16;
        return {
          x,
          y,
          facing: facingTowardEquipment(x, y),
          workoutStyle: "row",
        };
      }
      if (item.type === "yoga_mat") {
        const x = item.x + 35;
        const y = item.y + 15;
        return {
          x,
          y,
          facing: facingTowardEquipment(x, y),
          workoutStyle: "stretch",
        };
      }
      const x = item.x - 18;
      const y = item.y + 14;
      return {
        x,
        y,
        facing: facingTowardEquipment(x, y),
        workoutStyle: "box",
      };
    });

export const getQaLabStations = (
  items: FurnitureItem[],
): QaLabStationLocation[] =>
  items
    .filter((item) =>
      ["qa_terminal", "device_rack", "test_bench"].includes(item.type),
    )
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((item) => {
      // QA stations follow the same pattern as gym targets: derive a nearby standing point
      // from authored furniture so scene motion stays data-driven.
      const bounds = getItemBounds(item);
      const stationCenterX = bounds.x + bounds.w / 2;
      const stationCenterY = bounds.y + bounds.h / 2;
      const facingTowardStation = (targetX: number, targetY: number) =>
        Math.atan2(stationCenterX - targetX, stationCenterY - targetY);

      if (item.type === "qa_terminal") {
        const x = item.x + 26;
        const y = item.y + 56;
        return {
          x,
          y,
          facing: facingTowardStation(x, y),
          stationType: "console" as const,
        };
      }
      if (item.type === "device_rack") {
        const x = item.x - 18;
        const y = item.y + 18;
        return {
          x,
          y,
          facing: facingTowardStation(x, y),
          stationType: "device_rack" as const,
        };
      }
      const x = item.x + 45;
      const y = item.y + 58;
      return {
        x,
        y,
        facing: facingTowardStation(x, y),
        stationType: "bench" as const,
      };
    });

export const MEETING_OVERFLOW_LOCATIONS = [
  { x: 18, y: 118, facing: Math.PI / 2 },
  { x: 270, y: 118, facing: -Math.PI / 2 },
  { x: 145, y: 24, facing: Math.PI },
  { x: 145, y: 220, facing: 0 },
];

export const resolveDeskIndexForItem = (
  item: FurnitureItem,
  deskLocations: { x: number; y: number }[],
): number => {
  if (deskLocations.length === 0) return -1;
  if (item.type === "desk_cubicle") {
    return deskLocations.findIndex(
      (desk) => desk.x === item.x + 40 && desk.y === item.y - 5,
    );
  }

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < deskLocations.length; index += 1) {
    const desk = deskLocations[index];
    if (!desk) continue;
    const distance = Math.hypot(item.x - desk.x, item.y - desk.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestDistance <= 80 ? bestIndex : -1;
};
