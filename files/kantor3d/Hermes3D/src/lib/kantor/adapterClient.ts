import WebSocket from "ws";

/** Panggil satu method di adapter Kantor AI (paperclip-gateway-adapter) dari server Next. */
export async function callKantorAdapter<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 20000,
): Promise<T> {
  const url = process.env.KANTOR_ADAPTER_URL || "ws://127.0.0.1:18790";
  return new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(url);
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("Adapter kantor nggak merespons."))),
      timeoutMs,
    );
    ws.on("error", (error) => finish(() => reject(error)));
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "req", id: "c", method: "connect", params: {} }));
    });
    ws.on("message", (raw) => {
      let frame: { type?: string; id?: string; ok?: boolean; payload?: unknown; error?: { message?: string } };
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (frame.type !== "res") return;
      if (frame.id === "c") {
        ws.send(JSON.stringify({ type: "req", id: "m", method, params }));
        return;
      }
      if (frame.id === "m") {
        finish(() =>
          frame.ok
            ? resolve(frame.payload as T)
            : reject(new Error(frame.error?.message || "Gagal.")),
        );
      }
    });
  });
}
