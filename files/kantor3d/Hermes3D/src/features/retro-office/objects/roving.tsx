"use client";

// Karakter manusia realistis Microsoft Rocketbox (MIT) dipasang ke kantor Hermes3D.
// Didukung tekstur asli HD, animasi gender m & f, procedural typing, dan koreografi kantor.

import { memo, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDesk } from "@/vendor/roving/src/scene/props/desk.js";
import { SCALE } from "@/features/retro-office/core/constants";
import { getItemBaseSize, getItemRotationRadians, toWorld } from "@/features/retro-office/core/geometry";
import type { FurnitureItem, RenderAgent } from "@/features/retro-office/core/types";
import type { AgentModelProps } from "@/features/retro-office/objects/types";
import {
  ALL_AVATARS,
  BOSS_AGENT_ID,
  BOSS_TITLE,
  getAvatarInfo,
  getAnimUrl,
  type Gender,
} from "@/features/kantor/kantorAvatars";
import { slerpAngle } from "@/features/retro-office/core/smoothPath";
import { AVATAR_SIT_HIP, DESK_SEAT_HEIGHT, seatHeightAt } from "@/features/kantor/kantorSeats"; // Claude duduk-pas

/** Roving pakai satuan ~2.5 per orang; kantor Hermes3D ~1. Meja 4.4 roving = 100px Hermes. */
export const ROVING_SCALE = ((100 * SCALE) / 4.4) * 1.144; // A1: Bounding box tinggi meja 0.74m

/** Skala karakter manusia Rocketbox agar proporsional dengan meja & kursi kantor (A1: 0.58). */
const HUMAN_AVATAR_SCALE = 0.95; // A1: Bounding box tinggi manusia dewasa 1.72m

const LABEL_Y_STAND = 1.74; // Claude bubble-rapi: pas di atas kepala (tinggi avatar 1.63)
const LABEL_Y_SIT = 1.2;

export const AVATAR_NAMES = ALL_AVATARS;

export function getAvatarName(agentId: string, name?: string): string {
  return getAvatarInfo(agentId, name).avatarName;
}

const ANIM_KEYS = [
  "idle",
  "walk",
  "sit",
  "sit_type",
  "wave",
  "talk",
  "talk_boss",
  "thoughtful",
  "clap",
  "shrug",
  "drink",
] as const;

type AnimKey = (typeof ANIM_KEYS)[number];

// Claude loading: jangan preload semua avatar & animasi saat modul dimuat (40 MB, memenuhi antrean koneksi browser
// sehingga koneksi gateway ikut menunggu). useGLTF di RovingAgent memuat yang benar-benar dipakai.

// Claude root-motion: klip Rocketbox membawa gerak maju di tulang akar (Bip01 maju >1 m per siklus lalu loncat balik),
// padahal posisi agent sudah digerakkan tick. Buang kemiringan x/z-nya; sisa bob & goyang tetap.
const ROOT_TRACKS = new Set(["Bip01.position", "MotionExtractionHelper.position"]);
const strippedClips = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();
function stripRootMotion(clip: THREE.AnimationClip | undefined) {
  if (!clip) return clip;
  if (typeof window !== "undefined" && (window as any).__K3D_KEEP_ROOT__) return clip;
  const cached = strippedClips.get(clip);
  if (cached) return cached;
  const out = clip.clone();
  for (const track of out.tracks) {
    if (!ROOT_TRACKS.has(track.name) || track.values.length < 6) continue;
    const v = track.values, t = track.times, n = t.length, T = t[n - 1]! - t[0]! || 1;
    const dx = v[(n - 1) * 3]! - v[0]!, dz = v[(n - 1) * 3 + 2]! - v[2]!;
    for (let i = 0; i < n; i++) {
      const f = (t[i]! - t[0]!) / T;
      v[i * 3] = v[i * 3]! - dx * f;
      v[i * 3 + 2] = v[i * 3 + 2]! - dz * f;
    }
  }
  strippedClips.set(clip, out);
  return out;
}
// kecepatan alami klip jalan (unit dunia/detik): jarak Bip01 per siklus / 1.167 detik x skala avatar
const WALK_CLIP_SPEED: Record<string, number> = { m: (1.187 / 1.167) * HUMAN_AVATAR_SCALE, f: (1.412 / 1.167) * HUMAN_AVATAR_SCALE };

function RocketboxAvatarMesh({
  agentId,
  name,
  actorState,
  status,
  customAction,
  speedRef,
  seatHRef,
}: {
  agentId: string;
  name: string;
  actorState: string;
  status: string;
  customAction?: string | null;
  speedRef?: React.MutableRefObject<number>;
  seatHRef?: React.MutableRefObject<number>;
}) {
  const bodyRef = useRef<THREE.Group>(null); // Claude duduk-pas
  const shadowRef = useRef<THREE.Mesh>(null);
  const { avatarUrl, gender } = useMemo(() => getAvatarInfo(agentId, name), [agentId, name]);
  const { scene: avatarScene } = useGLTF(avatarUrl);
  const clonedScene = useMemo(() => SkeletonUtils.clone(avatarScene), [avatarScene]);

  // Muat animasi sesuai gender
  const idleAnim = useGLTF(getAnimUrl(gender, "idle"));
  const walkAnim = useGLTF(getAnimUrl(gender, "walk"));
  const sitAnim = useGLTF(getAnimUrl(gender, "sit"));
  const sitTypeAnim = useGLTF(getAnimUrl(gender, "sit_type"));
  const talkAnim = useGLTF(getAnimUrl(gender, "talk"));
  const clapAnim = useGLTF(getAnimUrl(gender, "clap"));
  const shrugAnim = useGLTF(getAnimUrl(gender, "shrug"));
  const drinkAnim = useGLTF(getAnimUrl(gender, "drink"));
  const thoughtfulAnim = useGLTF(getAnimUrl(gender, "thoughtful"));

  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // Cari tulang untuk procedural typing (T13.2 & A1)
  const typingBonesRef = useRef<{
    lUpperArm?: THREE.Bone;
    rUpperArm?: THREE.Bone;
    lForearm?: THREE.Bone;
    rForearm?: THREE.Bone;
    lHand?: THREE.Bone;
    rHand?: THREE.Bone;
    head?: THREE.Bone;
  }>({});

  useEffect(() => {
    const bones: typeof typingBonesRef.current = {};
    clonedScene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const b = child as THREE.Bone;
        const bname = b.name.toLowerCase();
        if (bname.includes("upperarm") && bname.includes("l")) bones.lUpperArm = b;
        else if (bname.includes("upperarm") && bname.includes("r")) bones.rUpperArm = b;
        else if (bname.includes("forearm") && bname.includes("l")) bones.lForearm = b;
        else if (bname.includes("forearm") && bname.includes("r")) bones.rForearm = b;
        else if (bname.includes("hand") && bname.includes("l")) bones.lHand = b;
        else if (bname.includes("hand") && bname.includes("r")) bones.rHand = b;
        else if (bname.includes("head")) bones.head = b;
      }
    });
    typingBonesRef.current = bones;
  }, [clonedScene]);

  const actions = useMemo(() => {
    const getClip = (gltf: any) => stripRootMotion(gltf?.animations?.[0]) as THREE.AnimationClip; // Claude root-motion
    return {
      idle: idleAnim ? mixer.clipAction(getClip(idleAnim)) : null,
      walk: walkAnim ? mixer.clipAction(getClip(walkAnim)) : null,
      sit: sitAnim ? mixer.clipAction(getClip(sitAnim)) : null,
      sit_type: sitTypeAnim ? mixer.clipAction(getClip(sitTypeAnim)) : null,
      talk: talkAnim ? mixer.clipAction(getClip(talkAnim)) : null,
      clap: clapAnim ? mixer.clipAction(getClip(clapAnim)) : null,
      shrug: shrugAnim ? mixer.clipAction(getClip(shrugAnim)) : null,
      drink: drinkAnim ? mixer.clipAction(getClip(drinkAnim)) : null,
      thoughtful: thoughtfulAnim ? mixer.clipAction(getClip(thoughtfulAnim)) : null,
    };
  }, [mixer, idleAnim, walkAnim, sitAnim, sitTypeAnim, talkAnim, clapAnim, shrugAnim, drinkAnim, thoughtfulAnim]);

  // Transisi animasi dinamis
  useEffect(() => {
    let nextKey: keyof typeof actions = "idle";
    if (customAction && actions[customAction as keyof typeof actions]) {
      nextKey = customAction as keyof typeof actions;
    } else if (actorState === "walking") {
      nextKey = "walk";
    } else if (actorState === "sitting") {
      nextKey = status === "working" ? "sit_type" : "sit";
    } else {
      nextKey = "idle"; // Claude root-motion: berdiri jangan pakai pose ngetik (kedip waktu ngalah di jalan)
    }

    const nextAction = actions[nextKey];
    if (nextAction && nextAction !== currentActionRef.current) {
      if (currentActionRef.current) {
        currentActionRef.current.fadeOut(0.35); // E6: Crossfade halus 0.35s
      }
      nextAction.reset().fadeIn(0.35).play();
      currentActionRef.current = nextAction;
    }
  }, [actorState, status, customAction, actions]);

  const isSitting = actorState === "sitting";

  useEffect(() => {
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer]);

  useFrame((state, delta) => {
    // Claude jalan-halus: langkah kaki ikut kecepatan jalan (klip jalan Rocketbox ~1.1 m/detik)
    if (actions.walk && speedRef) {
      const ts = speedRef.current / (WALK_CLIP_SPEED[gender] ?? 1.1); // Claude root-motion: kaki nggak meluncur
      actions.walk.timeScale = Math.min(1.5, Math.max(0.55, ts));
    }
    mixer.update(Math.min(delta, 0.1));
    // Claude root-motion debug: posisi pinggul yang dirender tiap frame
    if (typeof window !== "undefined" && (window as any).__K3D_HIPLOG__ && actorState === "walking") {
      const hip = clonedScene.getObjectByName("Bip01");
      if (hip) {
        const p = hip.getWorldPosition(new THREE.Vector3());
        (window as any).__K3D_HIPLOG__.push([Math.round(performance.now()), agentId, +p.x.toFixed(4), +p.z.toFixed(4)]);
      }
    }

    // Claude duduk-pas: pantat pas di dudukan kursi yang ditempati (tinggi beda per jenis kursi),
    // naik/turun halus barengan crossfade animasi duduk, bayangan tetap di lantai.
    const body = bodyRef.current;
    if (body) {
      const wantY = isSitting ? (seatHRef?.current ?? DESK_SEAT_HEIGHT) - AVATAR_SIT_HIP : 0;
      const wantZ = isSitting ? 0.08 : 0;
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 9);
      body.position.y += (wantY - body.position.y) * k;
      body.position.z += (wantZ - body.position.z) * k;
      if (shadowRef.current) shadowRef.current.position.y = -body.position.y / HUMAN_AVATAR_SCALE + 0.002;
    }

    // Procedural Typing (A1 & C2): Tangan di keyboard, kepala ke monitor
    const isTypingNow = (status === "working" || customAction === "type") && isSitting;
    if (isTypingNow) {
      const t = state.clock.getElapsedTime();
      const bones = typingBonesRef.current;
      const activeWindow = Math.sin(t * 1.8) > -0.4 ? 1 : 0.1;
      const freq = 48;
      if (bones.lUpperArm) {
        bones.lUpperArm.rotation.x += 0.35;
      }
      if (bones.rUpperArm) {
        bones.rUpperArm.rotation.x += 0.35;
      }
      if (bones.lForearm) {
        bones.lForearm.rotation.x += (0.2 + Math.sin(t * freq) * 0.035) * activeWindow;
      }
      if (bones.rForearm) {
        bones.rForearm.rotation.x += (0.2 + Math.cos(t * (freq + 3)) * 0.035) * activeWindow;
      }
      if (bones.lHand) {
        bones.lHand.rotation.z += Math.sin(t * (freq + 7)) * 0.03 * activeWindow;
      }
      if (bones.rHand) {
        bones.rHand.rotation.z += Math.cos(t * (freq + 5)) * 0.03 * activeWindow;
      }
      if (bones.head) {
        bones.head.rotation.x += 0.1;
      }
    }
  });

  // Claude duduk-pas: offset duduk diatur per frame di useFrame (tinggi dudukan beda tiap jenis kursi)
  return (
    <group ref={bodyRef} scale={[HUMAN_AVATAR_SCALE, HUMAN_AVATAR_SCALE, HUMAN_AVATAR_SCALE]}>
      <primitive object={clonedScene} />
      {/* Blob shadow sederhana di lantai */}
      <mesh ref={shadowRef} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 16]} />
        <meshBasicMaterial color="#000000" opacity={0.28} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

export const RovingAgentModel = memo(function RovingAgentModel({
  agentId,
  name,
  status,
  color,
  agentsRef,
  agentLookupRef,
  onHover,
  onUnhover,
  onClick,
  onContextMenu,
  showSpeech = false,
  speechText = null,
  suppressSpeechBubble = false,
  customAction = null,
  taskTitle = null,
  taskMinutes = null,
}: AgentModelProps & {
  customAction?: string | null;
  taskTitle?: string | null;
  taskMinutes?: number | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null); // Claude bubble-rapi
  const target = useRef(new THREE.Vector3());
  const placed = useRef(false);

  const [actorState, setActorState] = useState<string>("idle");
  // Claude jalan-halus
  const speedRef = useRef(0);
  const seatHRef = useRef(DESK_SEAT_HEIGHT); // Claude duduk-pas
  const lastActorPos = useRef<{ x: number; y: number; t: number } | null>(null);
  const pendingState = useRef<{ state: string; since: number } | null>(null);
  const isBoss = agentId === BOSS_AGENT_ID;

  useFrame((_, delta) => {
    const actor =
      agentLookupRef?.current?.get(agentId) ??
      agentsRef.current?.find((candidate) => candidate.id === agentId);
    const group = groupRef.current;
    if (!actor || !group) return;

    const [wx, , wz] = toWorld(actor.x, actor.y);
    target.current.set(wx, 0, wz);
    if (!placed.current) {
      group.position.copy(target.current);
      placed.current = true;
    } else {
      // Claude jalan-halus: gerak di tick sudah halus, cukup redam sedikit (tanpa telat)
      const jump = group.position.distanceTo(target.current);
      if (jump > 3) group.position.copy(target.current);
      else group.position.lerp(target.current, 1 - Math.exp(-delta * 20));
    }

    if (actor.state === "sitting") seatHRef.current = seatHeightAt(actor.x, actor.y); // Claude duduk-pas
    // Kecepatan nyata (unit dunia/detik) dari posisi tick, dihaluskan
    const nowMs = performance.now();
    const prev = lastActorPos.current;
    if (prev && nowMs > prev.t) {
      const v = (Math.hypot(actor.x - prev.x, actor.y - prev.y) * SCALE) / ((nowMs - prev.t) / 1000);
      speedRef.current += (Math.min(v, 3) - speedRef.current) * Math.min(1, delta * 8);
    }
    lastActorPos.current = { x: actor.x, y: actor.y, t: nowMs };

    // Rotasi badan halus
    group.rotation.y = slerpAngle(group.rotation.y, actor.facing, 1 - Math.exp(-delta * 10));

    // Debounce: jalan -> diam baru dianggap kalau diam > 0.25 detik (biar kaki nggak kedip)
    const want = actor.state;
    if (want === actorState) {
      pendingState.current = null;
    } else {
      if (!pendingState.current || pendingState.current.state !== want) {
        pendingState.current = { state: want, since: nowMs };
      }
      const hold = actorState === "walking" && want === "standing" ? 250 : 0;
      if (nowMs - pendingState.current.since >= hold) {
        pendingState.current = null;
        setActorState(want);
      }
    }
    group.visible = true;
    // Claude bubble-rapi: label ikut tinggi kepala (berdiri/duduk), turun-naik halus
    if (labelRef.current) {
      const wantY = actor.state === "sitting" ? LABEL_Y_SIT : LABEL_Y_STAND;
      labelRef.current.position.y += (wantY - labelRef.current.position.y) * (1 - Math.exp(-delta * 8));
    }
    // Claude debug-hook: posisi model yang dirender (dibaca alat ukur walk_render)
    const dbg = ((window as any).__K3D_RENDER__ ??= {});
    dbg[agentId] = [group.position.x, group.position.z, group.rotation.y, actorState, actor.state];
  });

  // Claude bubble-rapi: satu paragraf bersih (tanpa markdown/baris kosong), dipotong rapi
  const bubbleRaw = showSpeech && !suppressSpeechBubble && speechText ? speechText.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim() : "";
  const bubble = bubbleRaw ? (bubbleRaw.length > 130 ? `${bubbleRaw.slice(0, 128).trimEnd()}…` : bubbleRaw) : null;

  return (
    <group
      ref={groupRef}
      onPointerOver={(event) => {
        event.stopPropagation();
        if (!isBoss) onHover?.(agentId);
      }}
      onPointerOut={() => {
        if (!isBoss) onUnhover?.();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!isBoss) onClick?.(agentId);
      }}
      onContextMenu={(event) => {
        event.stopPropagation();
        if (!isBoss) {
          const nativeEvent = event.nativeEvent as MouseEvent;
          onContextMenu?.(agentId, nativeEvent.clientX, nativeEvent.clientY);
        }
      }}
    >
      <Suspense fallback={null}>
        <RocketboxAvatarMesh
          agentId={agentId}
          name={name}
          actorState={actorState}
          status={status}
          customAction={customAction}
          speedRef={speedRef}
          seatHRef={seatHRef}
        />
      </Suspense>

      {/* Claude bubble-rapi: nametag + bubble jadi satu tumpukan di atas kepala, ukuran tetap di layar (nggak membesar saat zoom) */}
      <group ref={labelRef} position={[0, LABEL_Y_STAND, 0]}>
        <Html zIndexRange={bubble ? [19, 16] : [15, 0]}>{/* Claude bubble-rapi: di bawah panel UI (z-20 ke atas) */}
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              transform: "translateX(-50%)",
              width: "max-content",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              pointerEvents: "none",
            }}
          >
            {bubble ? (
              <div
                style={{
                  position: "relative",
                  maxWidth: 220,
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  color: "#0f172a",
                  font: "500 12px/1.35 system-ui, -apple-system, sans-serif",
                  boxShadow: "0 3px 10px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    overflowWrap: "anywhere",
                  }}
                >
                  {bubble}
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: -5,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "5px solid #ffffff",
                  }}
                />
              </div>
            ) : null}
            <div
              style={{
                padding: "1px 7px",
                borderRadius: 9,
                background: isBoss ? "rgba(88, 28, 135, 0.94)" : "rgba(15, 23, 42, 0.86)",
                border: isBoss
                  ? "1px solid rgba(234, 179, 8, 0.85)"
                  : `1px solid ${status === "working" ? "rgba(16, 185, 129, 0.7)" : status === "error" ? "rgba(239, 68, 68, 0.7)" : "rgba(148, 163, 184, 0.35)"}`,
                color: "#f8fafc",
                fontSize: 10,
                lineHeight: "14px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: isBoss ? "#eab308" : status === "working" ? "#10b981" : status === "error" ? "#ef4444" : "#94a3b8",
                }}
              />
              <span>{isBoss ? BOSS_TITLE : name}</span>
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
});

type RovingDeskProps = {
  item: FurnitureItem;
  index: number;
  agentsRef: React.RefObject<RenderAgent[]>;
  onItemClick?: (itemUid: string) => void;
};

const RovingDesk = memo(function RovingDesk({ item, index, agentsRef, onItemClick }: RovingDeskProps) {
  const built = useMemo(
    () => buildDesk({ id: item._uid, x: 0, z: 0, facing: 0 }, index),
    [item._uid, index],
  );
  const { width, height } = getItemBaseSize(item);
  const baseRot = getItemRotationRadians(item);
  const seatOffsetPx = (1.6 * ROVING_SCALE) / SCALE;
  const [wx, , wz] =
    Math.abs(baseRot) < 1e-3
      ? toWorld(item.x + 40, item.y - 5 + seatOffsetPx)
      : toWorld(item.x + width / 2, item.y + height / 2);
  const rotY = baseRot + Math.PI;
  const center = useMemo(() => new THREE.Vector2(wx, wz), [wx, wz]);

  useFrame((_, delta) => {
    const agents = agentsRef.current ?? [];
    let busy = false;
    for (const actor of agents) {
      if (actor.state !== "sitting" || actor.status !== "working") continue;
      const [ax, , az] = toWorld(actor.x, actor.y);
      if (Math.hypot(ax - center.x, az - center.y) < 1.4) {
        busy = true;
        break;
      }
    }
    // C1: Monitor menyala (emissive) + canvas text bergulir saat working, redup saat idle
    if (busy !== built.handle.working) built.handle.setWorking(busy);
    built.handle.update(Math.min(delta, 0.1));
  });

  return (
    <group
      position={[wx, 0, wz]}
      rotation={[0, rotY, 0]}
      onClick={(event) => {
        if (!onItemClick) return;
        event.stopPropagation();
        onItemClick(item._uid);
      }}
    >
      <primitive object={built.obj} scale={ROVING_SCALE} />
    </group>
  );
});

export function RovingDeskItems({
  items,
  agentsRef,
  onItemClick,
}: {
  items: FurnitureItem[];
  agentsRef: React.RefObject<RenderAgent[]>;
  onItemClick?: (itemUid: string) => void;
}) {
  return (
    <>
      {items.map((item, index) => (
        <RovingDesk
          key={item._uid}
          item={item}
          index={index}
          agentsRef={agentsRef}
          onItemClick={onItemClick}
        />
      ))}
    </>
  );
}

export function isDeskClutter(item: FurnitureItem, desks: FurnitureItem[]): boolean {
  if (!["chair", "computer", "keyboard", "mouse", "trash"].includes(item.type)) {
    return false;
  }
  return desks.some((desk) => {
    const dx = desk.x + 40 - item.x;
    const dy = desk.y + 20 - item.y;
    return dx * dx + dy * dy < 70 * 70;
  });
}
