"use client";

export type KantorAgent = {
  id: string;
  name: string;
  title: string;
  role: string;
  reportsTo: string | null;
  paperclipStatus: string;
  working: boolean;
  currentIssue: string | null;
};

/** Panggil adapter Kantor AI lewat /api/kantor (server Next yang ngobrol ke adapter). */
export async function kantorCall<T = Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? "/kantor3d"}/api/kantor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

export const PAPERCLIP_URL = "/DIG/dashboard";
