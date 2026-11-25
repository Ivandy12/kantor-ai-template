// Kantor AI: Sistem Koreografi Kantor Hidup (Brief Tahap 4: E1-E7 & D1-D5)
import { BOSS_AGENT_ID, BOSS_NAME } from "./kantorAvatars";
import { fetchSceneDialog, type DialogLine } from "./kantorDialog";

export type ChoreographyType = "A" | "E1" | "E2" | "E3" | "E4" | "E5" | "E6";

export type ChoreographyStep = {
  actorId: string;
  type: "walk" | "talk" | "type" | "clap" | "shrug" | "sit" | "wait";
  targetX?: number;
  targetY?: number;
  facing?: number;
  bubbleText?: string;
  bubbleDurationMs?: number;
  durationMs: number;
};

export type ChoreographyScene = {
  id: string;
  type: ChoreographyType;
  title?: string;
  targetAgentId?: string;
  targetAgentName?: string;
  extraAgentId?: string;
  steps: ChoreographyStep[];
  currentStepIndex: number;
  stepStartedAt: number;
  totalStartedAt: number;
};

/** Bersihkan markdown dari teks balasan (D1) */
export function cleanReplyText(text: string, maxLen = 120): string {
  if (!text) return "";
  let s = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_#~>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > maxLen) {
    s = s.slice(0, maxLen - 1) + "…";
  }
  return s;
}

export class KantorChoreographyManager {
  private queue: ChoreographyScene[] = [];
  private activeScene: ChoreographyScene | null = null;
  private speechBubbles: Map<string, { text: string; expiresAt: number }> = new Map();
  private customActions: Map<string, string> = new Map();
  private followCamera = false;
  private activeActorId: string | null = null;

  public isFollowCameraEnabled(): boolean {
    return this.followCamera;
  }

  public toggleFollowCamera(): boolean {
    this.followCamera = !this.followCamera;
    return this.followCamera;
  }

  public getActiveActorId(): string | null {
    return this.activeActorId;
  }

  public setSpeechBubble(agentId: string, text: string, durationMs = 8000) {
    this.speechBubbles.set(agentId, {
      text,
      expiresAt: Date.now() + durationMs,
    });
  }

  public getSpeechBubble(agentId: string): string | null {
    const item = this.speechBubbles.get(agentId);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.speechBubbles.delete(agentId);
      return null;
    }
    return item.text;
  }

  public clearSpeechBubble(agentId: string) {
    this.speechBubbles.delete(agentId);
  }

  public setCustomAction(agentId: string, action: string) {
    this.customActions.set(agentId, action);
  }

  public getCustomAction(agentId: string): string | null {
    return this.customActions.get(agentId) ?? null;
  }

  public clearCustomAction(agentId: string) {
    this.customActions.delete(agentId);
  }

  public isBusy(agentId: string): boolean {
    if (!this.activeScene) return false;
    return (
      this.activeScene.steps.some((s) => s.actorId === agentId) ||
      this.activeScene.targetAgentId === agentId
    );
  }

  public enqueue(scene: ChoreographyScene) {
    if (this.queue.length > 6) {
      this.queue.shift();
    }
    this.queue.push(scene);
  }

  public update(deltaMs: number, getAgentPos: (id: string) => { x: number; y: number } | null) {
    const now = Date.now();

    for (const [id, item] of this.speechBubbles.entries()) {
      if (now > item.expiresAt) {
        this.speechBubbles.delete(id);
      }
    }

    if (!this.activeScene && this.queue.length > 0) {
      this.activeScene = this.queue.shift()!;
      this.activeScene.totalStartedAt = now;
      this.activeScene.stepStartedAt = now;
      this.activeScene.currentStepIndex = 0;
      this.executeStepStart(this.activeScene.steps[0]);
    }

    if (!this.activeScene) {
      this.activeActorId = null;
      return;
    }

    const scene = this.activeScene;
    if (now - scene.totalStartedAt > 30000) {
      this.finishActiveScene();
      return;
    }

    const step = scene.steps[scene.currentStepIndex];
    if (!step) {
      this.finishActiveScene();
      return;
    }

    this.activeActorId = step.actorId;
    const elapsed = now - scene.stepStartedAt;

    let stepFinished = false;
    if (step.type === "walk") {
      const pos = getAgentPos(step.actorId);
      if (pos && step.targetX !== undefined && step.targetY !== undefined) {
        const dist = Math.hypot(pos.x - step.targetX, pos.y - step.targetY);
        if (dist < 20 || elapsed > step.durationMs) {
          stepFinished = true;
        }
      } else if (elapsed > step.durationMs) {
        stepFinished = true;
      }
    } else {
      if (elapsed > step.durationMs) {
        stepFinished = true;
      }
    }

    if (stepFinished) {
      scene.currentStepIndex += 1;
      scene.stepStartedAt = now;
      if (scene.currentStepIndex < scene.steps.length) {
        this.executeStepStart(scene.steps[scene.currentStepIndex]);
      } else {
        this.finishActiveScene();
      }
    }
  }

  private executeStepStart(step?: ChoreographyStep) {
    if (!step) return;
    if (step.bubbleText) {
      this.setSpeechBubble(step.actorId, step.bubbleText, step.bubbleDurationMs || 6000);
    }
    if (step.type === "talk") {
      this.setCustomAction(step.actorId, "talk");
    } else if (step.type === "clap") {
      this.setCustomAction(step.actorId, "clap");
    } else if (step.type === "shrug") {
      this.setCustomAction(step.actorId, "shrug");
    } else if (step.type === "type") {
      this.setCustomAction(step.actorId, "type");
    } else {
      this.clearCustomAction(step.actorId);
    }
  }

  private finishActiveScene() {
    if (this.activeScene) {
      for (const step of this.activeScene.steps) {
        this.clearCustomAction(step.actorId);
      }
    }
    this.activeScene = null;
    this.activeActorId = null;
  }

  // ==========================================
  // FABRIK SKENARIO TAHAP 4 (E1 - E4)
  // ==========================================

  public createE1Scenario(params: {
    taskTitle: string;
    argaId: string;
    argaPos: { x: number; y: number };
    bossPos: { x: number; y: number };
    dialogLines?: DialogLine[];
  }): ChoreographyScene {
    const title = params.taskTitle.slice(0, 50);
    const guestChairPos = { x: 505, y: 215 };
    const lines = params.dialogLines || [
      { speakerId: BOSS_AGENT_ID, name: BOSS_NAME, text: `Arga, tolong jalankan tugas: ${title}` },
      { speakerId: params.argaId, name: "Arga", text: `Baik Pak Fauzy, segera saya delegasikan ke divisi terkait.` },
    ];

    return {
      id: `e1-${Date.now()}`,
      type: "E1",
      currentStepIndex: 0,
      stepStartedAt: 0,
      totalStartedAt: 0,
      steps: [
        {
          actorId: params.argaId,
          type: "walk",
          targetX: guestChairPos.x,
          targetY: guestChairPos.y,
          facing: 0,
          durationMs: 4500,
        },
        {
          actorId: params.argaId,
          type: "sit",
          facing: 0,
          durationMs: 800,
        },
        {
          actorId: BOSS_AGENT_ID,
          type: "talk",
          bubbleText: lines[0]?.text || `Arga, tolong: ${title}`,
          bubbleDurationMs: 4500,
          durationMs: 3500,
        },
        {
          actorId: params.argaId,
          type: "talk",
          bubbleText: lines[1]?.text || `Siap Pak Fauzy!`,
          bubbleDurationMs: 3500,
          durationMs: 2500,
        },
        {
          actorId: params.argaId,
          type: "walk",
          targetX: params.argaPos.x,
          targetY: params.argaPos.y,
          facing: Math.PI,
          durationMs: 4500,
        },
        {
          actorId: params.argaId,
          type: "sit",
          facing: Math.PI,
          durationMs: 1000,
        },
      ],
    };
  }

  public createE2Scenario(params: {
    taskTitle: string;
    argaId: string;
    targetAgentId: string;
    targetAgentName: string;
    targetDeskPos: { x: number; y: number };
    dialogLines?: DialogLine[];
  }): ChoreographyScene {
    const title = params.taskTitle.slice(0, 50);
    const ceoGuestPos = { x: 305, y: 215 };
    const lines = params.dialogLines || [
      { speakerId: params.argaId, name: "Arga", text: `${params.targetAgentName}, tolong fokus kerjakan: ${title}` },
      { speakerId: params.targetAgentId, name: params.targetAgentName, text: `Siap Mas Arga, langsung kami kerjakan sekarang!` },
    ];

    return {
      id: `e2-${Date.now()}`,
      type: "E2",
      currentStepIndex: 0,
      stepStartedAt: 0,
      totalStartedAt: 0,
      steps: [
        {
          actorId: params.targetAgentId,
          type: "walk",
          targetX: ceoGuestPos.x,
          targetY: ceoGuestPos.y,
          facing: 0,
          durationMs: 4500,
        },
        {
          actorId: params.targetAgentId,
          type: "sit",
          facing: 0,
          durationMs: 800,
        },
        {
          actorId: params.argaId,
          type: "talk",
          bubbleText: lines[0]?.text || `${params.targetAgentName}, brief: ${title}`,
          bubbleDurationMs: 4000,
          durationMs: 3200,
        },
        {
          actorId: params.targetAgentId,
          type: "talk",
          bubbleText: lines[1]?.text || `Siap Mas Arga!`,
          bubbleDurationMs: 3500,
          durationMs: 2500,
        },
        {
          actorId: params.targetAgentId,
          type: "walk",
          targetX: params.targetDeskPos.x,
          targetY: params.targetDeskPos.y,
          facing: Math.PI,
          durationMs: 4500,
        },
        {
          actorId: params.targetAgentId,
          type: "type",
          facing: Math.PI,
          durationMs: 2000,
        },
      ],
    };
  }

  public createE3Scenario(params: {
    taskTitle: string;
    argaId: string;
    targetAgentId: string;
    targetAgentName: string;
    targetDeskPos: { x: number; y: number };
    dialogLines?: DialogLine[];
  }): ChoreographyScene {
    const title = params.taskTitle.slice(0, 50);
    const ceoGuestPos = { x: 305, y: 215 };
    const lines = params.dialogLines || [
      { speakerId: params.targetAgentId, name: params.targetAgentName, text: `Mas Arga, tugas ${title} sudah tuntas 100%!` },
      { speakerId: params.argaId, name: "Arga", text: `Mantap, terima kasih ${params.targetAgentName}! Saya laporkan ke Pak Fauzy.` },
    ];

    return {
      id: `e3-${Date.now()}`,
      type: "E3",
      currentStepIndex: 0,
      stepStartedAt: 0,
      totalStartedAt: 0,
      steps: [
        {
          actorId: params.targetAgentId,
          type: "walk",
          targetX: ceoGuestPos.x,
          targetY: ceoGuestPos.y,
          facing: 0,
          durationMs: 4500,
        },
        {
          actorId: params.targetAgentId,
          type: "sit",
          facing: 0,
          durationMs: 800,
        },
        {
          actorId: params.targetAgentId,
          type: "talk",
          bubbleText: lines[0]?.text || `Mas Arga, tugas sudah beres 100%!`,
          bubbleDurationMs: 4000,
          durationMs: 3000,
        },
        {
          actorId: params.argaId,
          type: "talk",
          bubbleText: lines[1]?.text || `Mantap! Terima kasih.`,
          bubbleDurationMs: 3500,
          durationMs: 2500,
        },
        {
          actorId: params.targetAgentId,
          type: "walk",
          targetX: params.targetDeskPos.x,
          targetY: params.targetDeskPos.y,
          facing: Math.PI,
          durationMs: 4500,
        },
        {
          actorId: params.targetAgentId,
          type: "sit",
          facing: Math.PI,
          durationMs: 1000,
        },
      ],
    };
  }

  public createE4Scenario(params: {
    taskTitle: string;
    argaId: string;
    argaPos: { x: number; y: number };
    dialogLines?: DialogLine[];
  }): ChoreographyScene {
    const title = params.taskTitle.slice(0, 50);
    const guestChairPos = { x: 505, y: 215 };
    const lines = params.dialogLines || [
      { speakerId: params.argaId, name: "Arga", text: `Lapor Pak Fauzy, tugas ${title} selesai dengan hasil optimal.` },
      { speakerId: BOSS_AGENT_ID, name: BOSS_NAME, text: `Bagus sekali Arga, kerja tim luar biasa 👍` },
    ];

    return {
      id: `e4-${Date.now()}`,
      type: "E4",
      currentStepIndex: 0,
      stepStartedAt: 0,
      totalStartedAt: 0,
      steps: [
        {
          actorId: params.argaId,
          type: "walk",
          targetX: guestChairPos.x,
          targetY: guestChairPos.y,
          facing: 0,
          durationMs: 4500,
        },
        {
          actorId: params.argaId,
          type: "sit",
          facing: 0,
          durationMs: 800,
        },
        {
          actorId: params.argaId,
          type: "talk",
          bubbleText: lines[0]?.text || `Lapor Pak, tugas sudah tuntas.`,
          bubbleDurationMs: 4000,
          durationMs: 3000,
        },
        {
          actorId: BOSS_AGENT_ID,
          type: "clap",
          bubbleText: lines[1]?.text || `Bagus Arga, kerja tim luar biasa 👍`,
          bubbleDurationMs: 4500,
          durationMs: 3500,
        },
        {
          actorId: params.argaId,
          type: "walk",
          targetX: params.argaPos.x,
          targetY: params.argaPos.y,
          facing: Math.PI,
          durationMs: 4500,
        },
        {
          actorId: params.argaId,
          type: "sit",
          facing: Math.PI,
          durationMs: 1000,
        },
      ],
    };
  }

  public createChatScenario(params: {
    targetAgentId: string;
    targetAgentName: string;
    userMessage: string;
    assistantReply?: string;
  }): ChoreographyScene {
    const msg = cleanReplyText(params.userMessage, 80);
    const reply = cleanReplyText(params.assistantReply || "Siap Pak Fauzy! ROAS saat ini 3.8x, semua campaign stabil.", 120);
    return {
      id: `chat-${Date.now()}`,
      type: "A",
      currentStepIndex: 0,
      stepStartedAt: 0,
      totalStartedAt: 0,
      steps: [
        {
          actorId: BOSS_AGENT_ID,
          type: "type",
          durationMs: 2500,
        },
        {
          actorId: BOSS_AGENT_ID,
          type: "talk",
          bubbleText: msg,
          bubbleDurationMs: 4500,
          durationMs: 2000,
        },
        {
          actorId: params.targetAgentId,
          type: "wait",
          bubbleText: "💭 lagi mikir…",
          bubbleDurationMs: 5000,
          durationMs: 4000,
        },
        {
          actorId: params.targetAgentId,
          type: "type",
          durationMs: 2500,
        },
        {
          actorId: params.targetAgentId,
          type: "talk",
          bubbleText: reply,
          bubbleDurationMs: 9000,
          durationMs: 8500,
        },
      ],
    };
  }

  public createTaskScenario(params: any): ChoreographyScene {
    return this.createE1Scenario({
      taskTitle: params.taskTitle || "Tugas baru",
      argaId: params.argaId || "arga",
      argaPos: params.argaPos || { x: 333, y: 48 },
      bossPos: params.bossPos || { x: 533, y: 48 },
    });
  }

  public createDelegationScenario(params: any): ChoreographyScene {
    return this.createE2Scenario({
      taskTitle: params.taskTitle || "Delegasi tugas",
      argaId: params.argaId || "arga",
      targetAgentId: params.targetAgentId,
      targetAgentName: params.targetAgentName || "Tim",
      targetDeskPos: params.targetPos || { x: 540, y: 300 },
    });
  }

  public createCompletionScenario(params: any): ChoreographyScene {
    return this.createE4Scenario({
      taskTitle: params.taskTitle || "Tugas selesai",
      argaId: params.argaId || "arga",
      argaPos: params.argaPos || { x: 333, y: 48 },
    });
  }
}

export const globalChoreographyManager = new KantorChoreographyManager();
