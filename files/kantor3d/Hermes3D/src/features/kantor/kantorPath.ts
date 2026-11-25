// Claude: perhalusan jalur yang aman (cek garis pandang di nav grid) — tidak memotong menembus barang.
const GRID_CELL = 10; // Claude grid-halus (sama dengan core/navigation.ts)
const GRID_COLS = 180;
const GRID_ROWS = 180;
type P = { x: number; y: number };
export function isFreeAt(x: number, y: number, grid: Uint8Array): boolean {
  const c = Math.floor(x / GRID_CELL), r = Math.floor(y / GRID_CELL);
  if (c < 0 || r < 0 || c >= GRID_COLS || r >= GRID_ROWS) return false;
  return !grid[r * GRID_COLS + c];
}
export function lineFree(a: P, b: P, grid: Uint8Array): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1) return true;
  const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
  const steps = Math.ceil(d / 3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    // Claude jalur-lurus: nav-grid sudah dipadding radius badan (14px), jadi cukup margin kecil.
    // Dulu ±9 pada sel 10px: hampir semua garis gagal -> rute 40+ titik zig-zag.
    if (!isFreeAt(x, y, grid) || !isFreeAt(x + nx * 3, y + ny * 3, grid) || !isFreeAt(x - nx * 3, y - ny * 3, grid)) return false;
  }
  return true;
}
/** String-pulling: sambung titik terjauh yang masih terlihat lurus tanpa menembus sel terhalang. */
export function smoothSafe(start: P, raw: P[], grid: Uint8Array): P[] {
  if (raw.length <= 1) return raw;
  const pts = [start, ...raw];
  const out: P[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineFree(pts[i]!, pts[j]!, grid)) j--;
    out.push(pts[j]!);
    i = j;
  }
  return out;
}
