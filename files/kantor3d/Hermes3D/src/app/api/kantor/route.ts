import { NextResponse } from "next/server";

import { callKantorAdapter } from "@/lib/kantor/adapterClient";
import { syncMeetingToOffice, type KantorMeeting } from "@/lib/kantor/meetingSync";

export const runtime = "nodejs";

// Hanya method milik Kantor AI yang boleh dipanggil dari browser.
const ALLOWED = new Set([
  "kantor.overview",
  "kantor.task.create",
  "kantor.chat.last",
  "kantor.issues",
  "kantor.issue",
  "kantor.approvals",
  "kantor.meeting.start",
  "kantor.meeting.get",
  "kantor.meeting.stop",
  "kantor.meeting.tasks",
  "kantor.meeting.say", // Claude rapat-ai
  "kantor.agent.hapus.list", // Claude hapus-agent
  "kantor.agent.hapus.setujui",
  "kantor.agent.hapus.tolak",
  "kantor.scene.dialog",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { method?: string; params?: Record<string, unknown> };
    const method = typeof body.method === "string" ? body.method : "";
    if (!ALLOWED.has(method)) {
      return NextResponse.json({ error: "Method tidak dikenal." }, { status: 400 });
    }
    const timeout = method === "kantor.meeting.tasks" ? 90000 : method === "kantor.scene.dialog" ? 60000 : 25000;
    const payload = await callKantorAdapter<Record<string, unknown>>(method, body.params ?? {}, timeout);
    if (method.startsWith("kantor.meeting.") && payload && "meeting" in payload) {
      try {
        syncMeetingToOffice((payload as { meeting: KantorMeeting | null }).meeting);
      } catch (error) {
        console.error("[kantor] sync rapat ke kantor 3D gagal", error);
      }
    }
    return NextResponse.json(payload ?? {}, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
