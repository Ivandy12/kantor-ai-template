"use client";

import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SCALE } from "@/features/retro-office/core/constants";
import { toWorld } from "@/features/retro-office/core/geometry";
import type { FurnitureItem } from "@/features/retro-office/core/types";
import { getBrandName } from "./brand";

/**
 * 1. BATU PRASASTI NAMA KANTOR DINAMIS (Foto 2 - Pojok Kanan Bawah Depan Gerbang)
 * Teks di atas batu berubah otomatis sesuai nama kantor (contoh: IvanAdha)
 */
function createStoneTexture(brandName: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;

  // Background batu granit alam dengan tekstur lembut
  const grad = g.createRadialGradient(256, 128, 20, 256, 128, 240);
  grad.addColorStop(0, "#f4ece1");
  grad.addColorStop(0.5, "#e3d5c2");
  grad.addColorStop(1, "#c4b198");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);

  // Efek bintik-bintik batu alam
  g.fillStyle = "rgba(90, 70, 50, 0.12)";
  for (let i = 0; i < 600; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 256;
    const rs = Math.random() * 3 + 1;
    g.beginPath();
    g.arc(rx, ry, rs, 0, Math.PI * 2);
    g.fill();
  }

  // Bingkai ukiran batu
  g.strokeStyle = "rgba(100, 75, 45, 0.4)";
  g.lineWidth = 6;
  g.strokeRect(20, 20, 472, 216);

  // Teks Ukiran Nama Brand / Kantor (Contoh: IvanAdha)
  const displayName = (brandName || "IvanAdha").toUpperCase();
  g.textAlign = "center";
  g.textBaseline = "middle";

  // Ukir bayangan dalam (embossed effect)
  g.fillStyle = "rgba(45, 30, 15, 0.85)";
  g.font = `bold ${displayName.length > 12 ? 40 : 52}px 'Cinzel', 'Georgia', serif`;
  g.fillText(displayName, 256, 120);

  // Highlight emas hangat
  g.fillStyle = "#8a581e";
  g.fillText(displayName, 255, 119);

  // Subtitle ukiran bawah
  g.fillStyle = "rgba(80, 60, 40, 0.75)";
  g.font = "bold 18px 'Cinzel', 'Georgia', sans-serif";
  g.fillText("HEADQUARTERS", 256, 175);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const CompanyStoneItem = memo(function CompanyStoneItem({ item }: { item: FurnitureItem }) {
  const brand = getBrandName();
  const tex = useMemo(() => createStoneTexture(brand), [brand]);
  const [cx, , cz] = toWorld(item.x + (item.w ?? 70) / 2, item.y + (item.h ?? 40) / 2);

  return (
    <group position={[cx, 0, cz]} rotation={[0, (item.facing ?? 0) * (Math.PI / 180), 0]}>
      {/* Dasar pondasi batu alam */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.24, 0.9]} />
        <meshStandardMaterial color="#686054" roughness={0.9} />
      </mesh>
      {/* Bebatuan kecil di kaki prasasti */}
      {[-0.65, 0.65].map((off, idx) => (
        <mesh key={idx} position={[off, 0.15, 0.35]} castShadow>
          <dodecahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial color="#7a7062" roughness={0.85} />
        </mesh>
      ))}
      {/* Monolit batu utama dengan bidang ukiran */}
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.35, 0.85, 0.45]} />
        <meshStandardMaterial color="#d4c5b0" roughness={0.7} />
      </mesh>
      {/* Bidang datar tempat nama kantor */}
      <mesh position={[0, 0.65, 0.23]}>
        <planeGeometry args={[1.25, 0.75]} />
        <meshStandardMaterial
          map={tex ?? undefined}
          roughness={0.65}
          metalness={0.1}
        />
      </mesh>
      {/* Lentera sorot batu (lampu sorot warm glow) */}
      <pointLight position={[0, 0.8, 0.7]} color="#ffeedd" intensity={1.5} distance={3} />
    </group>
  );
});

/**
 * 2. KOLAM IKAN KOI & JEMBATAN KAYU (Foto 2 & 3 - Courtyard Tengah)
 */
export const KoiPondItem = memo(function KoiPondItem({ item }: { item: FurnitureItem }) {
  const w = (item.w ?? 220) * SCALE;
  const d = (item.h ?? 160) * SCALE;
  const [cx, , cz] = toWorld(item.x + (item.w ?? 220) / 2, item.y + (item.h ?? 160) / 2);
  const waterRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (waterRef.current) {
      waterRef.current.position.y = 0.04 + Math.sin(state.clock.elapsedTime * 1.5) * 0.005;
    }
  });

  return (
    <group position={[cx, 0, cz]}>
      {/* Dasar cekungan kolam (batu dasar & lumut) */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[w, 0.1, d]} />
        <meshStandardMaterial color="#1a2e26" roughness={0.8} />
      </mesh>

      {/* Permukaan Air Kolam Zamrud (Emerald Water Surface) */}
      <mesh ref={waterRef} position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[w - 0.15, 0.02, d - 0.15]} />
        <meshStandardMaterial
          color="#156158"
          roughness={0.1}
          metalness={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Batas bibir kolam batu alam (Border rocks) */}
      {[-1, 1].map((side) => (
        <group key={`edge-x-${side}`}>
          <mesh position={[side * (w / 2 - 0.05), 0.08, 0]} castShadow>
            <boxGeometry args={[0.15, 0.16, d]} />
            <meshStandardMaterial color="#554d42" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.08, side * (d / 2 - 0.05)]} castShadow>
            <boxGeometry args={[w, 0.16, 0.15]} />
            <meshStandardMaterial color="#554d42" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Ikan Koi bergerak di dalam air */}
      {[-0.3, 0.2].map((x, i) => (
        <mesh key={`koi-${i}`} position={[x * (w / 2), 0.02, (i === 0 ? 0.3 : -0.2) * (d / 2)]}>
          <coneGeometry args={[0.04, 0.14, 5]} />
          <meshStandardMaterial color={i === 0 ? "#ff4500" : "#ffffff"} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Jembatan Lengkung Kayu Khas Jepang (Zen Wooden Bridge)
 */
export const ZenBridgeItem = memo(function ZenBridgeItem({ item }: { item: FurnitureItem }) {
  const w = (item.w ?? 90) * SCALE;
  const d = (item.h ?? 45) * SCALE;
  const [cx, , cz] = toWorld(item.x + (item.w ?? 90) / 2, item.y + (item.h ?? 45) / 2);

  return (
    <group position={[cx, 0, cz]} rotation={[0, (item.facing ?? 0) * (Math.PI / 180), 0]}>
      {/* Lengkungan geladak jembatan kayu */}
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.06, d]} />
        <meshStandardMaterial color="#8b3a2b" roughness={0.6} />
      </mesh>
      {/* Pagar merah vermilion jembatan */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0.35, s * (d / 2 - 0.04)]}>
          <mesh castShadow>
            <boxGeometry args={[w, 0.04, 0.04]} />
            <meshStandardMaterial color="#a8281a" roughness={0.5} />
          </mesh>
          {[-w / 2 + 0.1, 0, w / 2 - 0.1].map((px, idx) => (
            <mesh key={idx} position={[px, -0.09, 0]} castShadow>
              <cylinderGeometry args={[0.02, 0.02, 0.22, 6]} />
              <meshStandardMaterial color="#a8281a" roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
});

/**
 * 3. POHON SAKURA & MAPLE MERAH JEPANG (Foto 2 & 3)
 */
export const SakuraTreeItem = memo(function SakuraTreeItem({ item }: { item: FurnitureItem }) {
  const [cx, , cz] = toWorld(item.x + 20, item.y + 20);
  const isMaple = item.type === "maple_tree";

  return (
    <group position={[cx, 0, cz]}>
      {/* Batang kayu pohon tua bertekstur */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 1.3, 7]} />
        <meshStandardMaterial color="#423125" roughness={0.9} />
      </mesh>
      {/* Mahkota daun bunga sakura / maple Jepang */}
      <group position={[0, 1.45, 0]}>
        <mesh position={[0, 0, 0]} castShadow>
          <sphereGeometry args={[0.65, 8, 8]} />
          <meshStandardMaterial
            color={isMaple ? "#c8321a" : "#ffaec9"}
            roughness={0.7}
          />
        </mesh>
        <mesh position={[0.25, -0.15, 0.2]} castShadow>
          <sphereGeometry args={[0.45, 7, 7]} />
          <meshStandardMaterial
            color={isMaple ? "#a82010" : "#ff85a2"}
            roughness={0.7}
          />
        </mesh>
        <mesh position={[-0.25, -0.1, -0.18]} castShadow>
          <sphereGeometry args={[0.5, 7, 7]} />
          <meshStandardMaterial
            color={isMaple ? "#d44520" : "#ffccd8"}
            roughness={0.7}
          />
        </mesh>
      </group>
    </group>
  );
});

/**
 * 4. CYBER SERVER RACK & TECH LAB (Foto 2 & 3 - Ruang Server Kanan)
 */
export const CyberServerRackItem = memo(function CyberServerRackItem({ item }: { item: FurnitureItem }) {
  const w = (item.w ?? 40) * SCALE;
  const d = (item.h ?? 30) * SCALE;
  const [cx, , cz] = toWorld(item.x + (item.w ?? 40) / 2, item.y + (item.h ?? 30) / 2);

  return (
    <group position={[cx, 0, cz]}>
      {/* Bodi rack hitam */}
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 1.7, d]} />
        <meshStandardMaterial color="#0b0e14" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Panel kaca depan bergaris LED neon biru / cyan */}
      <mesh position={[0, 0.85, d / 2 + 0.01]}>
        <planeGeometry args={[w - 0.06, 1.55]} />
        <meshStandardMaterial
          color="#06121f"
          emissive="#00e5ff"
          emissiveIntensity={0.65}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
});

/**
 * 5. MEJA BILIAR & PINGPONG (Foto 2 - Ruang Santai Selatan)
 */
export const BilliardTableItem = memo(function BilliardTableItem({ item }: { item: FurnitureItem }) {
  const w = (item.w ?? 80) * SCALE;
  const d = (item.h ?? 45) * SCALE;
  const [cx, , cz] = toWorld(item.x + (item.w ?? 80) / 2, item.y + (item.h ?? 45) / 2);

  return (
    <group position={[cx, 0, cz]}>
      {/* Meja kayu mahoni */}
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.72, d]} />
        <meshStandardMaterial color="#3d2314" roughness={0.7} />
      </mesh>
      {/* Lapangan kain karpet hijau biliar */}
      <mesh position={[0, 0.725, 0]}>
        <boxGeometry args={[w - 0.1, 0.02, d - 0.1]} />
        <meshStandardMaterial color="#1b663e" roughness={0.9} />
      </mesh>
    </group>
  );
});

export const PingPongTableItem = memo(function PingPongTableItem({ item }: { item: FurnitureItem }) {
  const w = (item.w ?? 80) * SCALE;
  const d = (item.h ?? 45) * SCALE;
  const [cx, , cz] = toWorld(item.x + (item.w ?? 80) / 2, item.y + (item.h ?? 45) / 2);

  return (
    <group position={[cx, 0, cz]}>
      {/* Meja turnamen biru */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.76, d]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.4} />
      </mesh>
      {/* Garis putih tengah */}
      <mesh position={[0, 0.765, 0]}>
        <boxGeometry args={[0.02, 0.01, d]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Jaring net */}
      <mesh position={[0, 0.83, 0]}>
        <boxGeometry args={[0.01, 0.12, d + 0.06]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
    </group>
  );
});
