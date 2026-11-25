import { loadActiveStandupMeeting, saveStandupMeeting } from "@/lib/office/standup/store";
import type { StandupMeeting, StandupSummaryCard } from "@/lib/office/standup/types";

export type KantorTranscriptEntry = {
  agentId: string;
  name: string;
  stance: string | null;
  round: number;
  text: string;
  ts: number;
  live?: boolean;
};

export type KantorMeeting = {
  id: string;
  topic: string;
  mode: "diskusi" | "debat";
  rounds: number;
  round: number;
  moderatorId: string;
  moderatorName: string;
  participants: { id: string; name: string; title: string; stance: string | null }[];
  phase: "berjalan" | "notulen" | "selesai" | "dihentikan" | "gagal";
  speakingAgentId: string | null;
  transcript: KantorTranscriptEntry[];
  notulen: Record<string, unknown> | null;
  error: string | null;
  tasksCreated: number[];
  startedAt: number;
  endedAt: number | null;
};

const SPEAKER_HOLD_MS = 10 * 60 * 1000;

/**
 * Cerminkan rapat Kantor AI ke "standup meeting" bawaan Hermes3D, supaya di kantor 3D
 * pesertanya jalan ke ruang rapat dan yang lagi ngomong muncul gelembung bicaranya.
 * Jika meeting null atau phase selesai/dihentikan/gagal, bersihkan standup agar tidak nyangkut.
 */
export function syncMeetingToOffice(meeting: KantorMeeting | null) {
  const active = loadActiveStandupMeeting();

  // Jika meeting null atau tidak sedang berlangsung (selesai, dihentikan, gagal) -> bersihkan standup
  const running = meeting && (meeting.phase === "berjalan" || meeting.phase === "notulen");
  if (!meeting || !running) {
    if (active && active.id.startsWith("kantor-")) { // Claude rapat-ai: standup lain jangan ikut terhapus
      saveStandupMeeting(null);
    }
    return;
  }

  const isOurs = active?.id === `kantor-${meeting.id}`;

  const latestByAgent = new Map<string, string>();
  for (const entry of meeting.transcript) {
    if (entry.text) latestByAgent.set(entry.agentId, entry.text);
  }
  const cards: StandupSummaryCard[] = meeting.participants.map((p) => {
    const text = latestByAgent.get(p.id) || (p.id === meeting.moderatorId ? "Membuka rapat…" : "Nunggu giliran…");
    return {
      agentId: p.id,
      agentName: p.name,
      speech: text.length > 280 ? `${text.slice(0, 277)}…` : text,
      currentTask: meeting.topic,
      blockers: [],
      recentCommits: [],
      activeTickets: [],
      manualNotes: [],
      sourceStates: [],
    };
  });

  const now = new Date().toISOString();
  const base: StandupMeeting =
    isOurs && active
      ? active
      : {
          id: `kantor-${meeting.id}`,
          trigger: "manual",
          phase: "gathering",
          scheduledFor: null,
          startedAt: now,
          updatedAt: now,
          completedAt: null,
          currentSpeakerAgentId: null,
          speakerStartedAt: null,
          speakerDurationMs: SPEAKER_HOLD_MS,
          participantOrder: meeting.participants.map((p) => p.id),
          arrivedAgentIds: [],
          cards,
        };

  const speaker = meeting.speakingAgentId;
  const speakerChanged = speaker && speaker !== base.currentSpeakerAgentId;
  saveStandupMeeting({
    ...base,
    cards,
    speakerDurationMs: SPEAKER_HOLD_MS,
    phase: speaker ? "in_progress" : base.phase === "complete" ? "gathering" : base.phase,
    currentSpeakerAgentId: speaker ?? base.currentSpeakerAgentId,
    speakerStartedAt: speakerChanged ? now : base.speakerStartedAt ?? (speaker ? now : null),
    updatedAt: now,
  });
}
