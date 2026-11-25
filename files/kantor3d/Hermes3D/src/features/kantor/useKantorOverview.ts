"use client";

import { useEffect, useState } from "react";

import { kantorCall, type KantorAgent } from "@/features/kantor/kantorApi";

// Satu poller bersama untuk data tim Paperclip (status, jabatan, atasan, tugas aktif).
let cache: KantorAgent[] = [];
const listeners = new Set<(a: KantorAgent[]) => void>();
let timer: number | null = null;

async function tick() {
  try {
    const out = await kantorCall<{ agents: KantorAgent[] }>("kantor.overview");
    cache = out.agents ?? [];
    listeners.forEach((fn) => fn(cache));
  } catch {
    /* adapter belum siap */
  }
}

export function useKantorOverview(): KantorAgent[] {
  const [agents, setAgents] = useState<KantorAgent[]>(cache);
  useEffect(() => {
    listeners.add(setAgents);
    if (timer === null) {
      void tick();
      timer = window.setInterval(() => void tick(), 8000);
    }
    return () => {
      listeners.delete(setAgents);
      if (listeners.size === 0 && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return agents;
}
