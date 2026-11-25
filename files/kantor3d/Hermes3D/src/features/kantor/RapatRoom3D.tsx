"use client";

// Claude ruang-rapat (30 Okt 2026): meja rapat besar + layar presentasi, ukuran mengikuti item (w/h) persis,
// jadi yang kelihatan = yang diblok nav-grid (beda dengan table.glb yang ukurannya tetap).
import { memo, useMemo } from "react";
import * as THREE from "three";
import { SCALE } from "@/features/retro-office/core/constants";
import { toWorld } from "@/features/retro-office/core/geometry";
import type { FurnitureItem } from "@/features/retro-office/core/types";

const TOP_Y = 0.74; // tinggi meja kerja (DESK_TOP_Y vendor × ROVING_SCALE)

function screenTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, "#1e3a8a"); grad.addColorStop(1, "#0f172a");
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#fbbf24"; g.font = "bold 44px sans-serif"; g.textAlign = "center";
  g.fillText("RAPAT TIM", 256, 105);
  g.fillStyle = "#e2e8f0"; g.font = "28px sans-serif";
  g.fillText("Digital Strategi", 256, 155);
  g.fillStyle = "#38bdf8"; g.fillRect(96, 185, 320, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const RapatRoomItem = memo(function RapatRoomItem({ item }: { item: FurnitureItem }) {
  const w = (item.w ?? 80) * SCALE, d = (item.h ?? 40) * SCALE;
  const [cx, , cz] = toWorld(item.x + (item.w ?? 80) / 2, item.y + (item.h ?? 40) / 2);
  const tex = useMemo(() => (item.type === "presentation_screen" ? screenTexture() : null), [item.type]);
  if (item.type === "presentation_screen") {
    return (
      <group position={[cx, 0, cz]}>
        <mesh position={[0, 1.3, 0]} castShadow>
          <boxGeometry args={[w, 0.72, Math.max(d, 0.04)]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <mesh position={[0, 1.3, Math.max(d, 0.04) / 2 + 0.002]}>
          <planeGeometry args={[w - 0.06, 0.64]} />
          <meshStandardMaterial map={tex ?? undefined} emissive="#ffffff" emissiveMap={tex ?? undefined} emissiveIntensity={0.55} />
        </mesh>
      </group>
    );
  }
  // meja rapat: papan + 2 kaki panel
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, TOP_Y - 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color="#7a4a24" roughness={0.55} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.12), (TOP_Y - 0.05) / 2, 0]} castShadow>
          <boxGeometry args={[0.06, TOP_Y - 0.05, d * 0.7]} />
          <meshStandardMaterial color="#2b2118" />
        </mesh>
      ))}
    </group>
  );
});
