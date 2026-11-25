// Kantor AI: Pengaturan perilaku agent idle & tujuan jelas (Brief Tahap 4: F1 - F4)
import type { FurnitureItem, RenderAgent } from "@/features/retro-office/core/types";
import { LOUNGE_SEATS } from "./kantorLayout";

export type IdleActivityType = "desk" | "pantry" | "sofa" | "coworker";

export type IdleAgentActivity = {
  agentId: string;
  type: IdleActivityType;
  targetX: number;
  targetY: number;
  facing: number;
  action: "sit" | "drink" | "talk" | "idle";
  startedAt: number;
  durationMs: number;
  state: "walking_to" | "doing" | "walking_back";
};

// Titik tujuan terdaftar (F1 & F2)
export const IDLE_DESTINATIONS = {
  // Claude v1.3: berdiri di depan mesin kopi & dispenser pantry (dulu titiknya nyasar ke ruang rapat)
  pantry: [
    { x: 806, y: 668, facing: 0, action: "drink" as const },
    { x: 1052, y: 670, facing: 0, action: "drink" as const },
  ],
  // dudukan sofa lounge yang sebenarnya (dulu satu titik di dalam badan sofa, satu lagi di dalam meja tim Tech)
  sofa: LOUNGE_SEATS.map((s) => ({ x: s.x, y: s.y, facing: s.facing, action: "sit" as const })),
};

/** Cek apakah titik (x, y) berada di dekat kursi atau sofa (jarak <= 18px) */
export function isNearSeat(x: number, y: number, furniture: FurnitureItem[], deskLocations: Array<{ x: number; y: number }>): boolean {
  // Cek meja cubicle (kursi di sisi utara: x+40, y-5)
  for (const d of deskLocations) {
    if (Math.hypot(d.x - x, d.y - y) <= 18) return true;
  }
  // Cek kursi & sofa lainnya
  for (const it of furniture) {
    if (it.type === "chair" || it.type === "couch" || it.type === "couch_v" || it.type === "beanbag") {
      const cx = it.x + (it.w ? it.w / 2 : 15);
      const cy = it.y + (it.h ? it.h / 2 : 15);
      if (Math.hypot(cx - x, cy - y) <= 22) return true;
    }
  }
  return false;
}

export class KantorIdleManager {
  private activities: Map<string, IdleAgentActivity> = new Map();
  private nextEligibleTime: Map<string, number> = new Map();

  /** Maksimal 4 agent di luar meja bersamaan (F2) */
  private readonly MAX_CONCURRENT_AWAY = 4;

  public getActivity(agentId: string): IdleAgentActivity | undefined {
    return this.activities.get(agentId);
  }

  /** Titik tujuan sudah dipakai agent lain (biar nggak dua orang di satu dudukan). */
  private isTaken(x: number, y: number): boolean {
    for (const act of this.activities.values()) if (Math.hypot(act.targetX - x, act.targetY - y) < 20) return true;
    return false;
  }

  public getAwayCount(): number {
    let count = 0;
    for (const act of this.activities.values()) {
      if (act.type !== "desk") count += 1;
    }
    return count;
  }

  /** Mulai aktivitas idle acak yang terarah */
  public maybeStartIdleActivity(params: {
    agentId: string;
    deskPos: { x: number; y: number };
    otherAgents: RenderAgent[];
    now: number;
  }): IdleAgentActivity | null {
    const { agentId, deskPos, otherAgents, now } = params;

    const eligible = this.nextEligibleTime.get(agentId) ?? 0;
    if (now < eligible) return null;

    if (this.activities.has(agentId)) {
      return this.activities.get(agentId)!;
    }

    if (this.getAwayCount() >= this.MAX_CONCURRENT_AWAY) {
      return null;
    }

    const roll = Math.random();
    let act: IdleAgentActivity;

    if (roll < 0.35) {
      const freeP = IDLE_DESTINATIONS.pantry.filter((d) => !this.isTaken(d.x, d.y));
      if (!freeP.length) return null;
      const p = freeP[Math.floor(Math.random() * freeP.length)]!;
      act = {
        agentId,
        type: "pantry",
        targetX: p.x,
        targetY: p.y,
        facing: p.facing,
        action: p.action,
        startedAt: now,
        durationMs: 30000 + Math.random() * 40000,
        state: "walking_to",
      };
    } else if (roll < 0.70) {
      const freeS = IDLE_DESTINATIONS.sofa.filter((d) => !this.isTaken(d.x, d.y));
      if (!freeS.length) return null;
      const s = freeS[Math.floor(Math.random() * freeS.length)]!;
      act = {
        agentId,
        type: "sofa",
        targetX: s.x,
        targetY: s.y,
        facing: s.facing,
        action: s.action,
        startedAt: now,
        durationMs: 45000 + Math.random() * 45000,
        state: "walking_to",
      };
    } else {
      const candidates = otherAgents.filter(
        (a) => a.id !== agentId && a.state === "sitting" && a.status === "idle"
      );
      if (candidates.length > 0) {
        const friend = candidates[Math.floor(Math.random() * candidates.length)]!;
        act = {
          agentId,
          type: "coworker",
          targetX: friend.x + 35,
          targetY: friend.y + 15,
          facing: Math.atan2(friend.x - (friend.x + 35), friend.y - (friend.y + 15)),
          action: "talk",
          startedAt: now,
          durationMs: 30000 + Math.random() * 30000,
          state: "walking_to",
        };
      } else {
        return null;
      }
    }

    this.activities.set(agentId, act);
    return act;
  }

  public updateActivity(agentId: string, currentX: number, currentY: number, now: number): "walking_to" | "doing" | "walking_back" | "finished" {
    const act = this.activities.get(agentId);
    if (!act) return "finished";

    const elapsed = now - act.startedAt;
    const distToTarget = Math.hypot(act.targetX - currentX, act.targetY - currentY);

    if (act.state === "walking_to") {
      if (distToTarget < 20 || elapsed > 15000) {
        act.state = "doing";
        act.startedAt = now;
      }
      return "walking_to";
    }

    if (act.state === "doing") {
      if (elapsed > act.durationMs) {
        act.state = "walking_back";
        act.startedAt = now;
      }
      return "doing";
    }

    if (act.state === "walking_back") {
      return "walking_back";
    }

    return "finished";
  }

  public stopActivity(agentId: string) {
    this.activities.delete(agentId);
    const cooldown = 120000 + Math.random() * 240000;
    this.nextEligibleTime.set(agentId, Date.now() + cooldown);
  }

  public recallToDesk(agentId: string) {
    this.stopActivity(agentId);
  }
}

export const globalKantorIdleManager = new KantorIdleManager();
