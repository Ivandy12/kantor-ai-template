// Smooth Path & Slerp Rotation (Brief Tahap 4: A5)
// Interpolasi frame halus, string-pulling smoothing, slerp rotasi, anti-jitter

export type Point2D = { x: number; y: number };

/**
 * String pulling smoothing untuk jalur A*.
 * Menghilangkan sudut tajam / zig-zag grid 25px.
 */
export function smoothPath(rawPath: Point2D[]): Point2D[] {
  if (rawPath.length <= 2) return rawPath;
  const smoothed: Point2D[] = [rawPath[0]!];
  let currentIdx = 0;

  while (currentIdx < rawPath.length - 1) {
    let furthestVisible = currentIdx + 1;
    // Coba tembus pandang 2-3 waypoint ke depan untuk menghilangkan lekukan grid
    for (let testIdx = currentIdx + 2; testIdx < Math.min(currentIdx + 4, rawPath.length); testIdx++) {
      const p1 = rawPath[currentIdx]!;
      const p2 = rawPath[testIdx]!;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      // Jika jarak garis lurus pendek (< 80px), satukan jadi satu garis lurus
      if (dist < 80) {
        furthestVisible = testIdx;
      }
    }
    smoothed.push(rawPath[furthestVisible]!);
    currentIdx = furthestVisible;
  }
  return smoothed;
}

/**
 * Interpolasi sudut rotasi terpendek (slerp 1D)
 */
export function slerpAngle(currentAngle: number, targetAngle: number, alpha: number): number {
  let diff = targetAngle - currentAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return currentAngle + diff * Math.min(Math.max(alpha, 0), 1);
}
