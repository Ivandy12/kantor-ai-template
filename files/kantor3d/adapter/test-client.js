// node test-client.js <method> '<json params>' [waitEventMs]
const WebSocket = require("ws");
const [method, paramsJson, waitMs] = process.argv.slice(2);
const ws = new WebSocket(process.env.URL || "ws://127.0.0.1:18790");
let n = 0;
const call = (m, p) => new Promise((res) => {
  const id = String(++n);
  const h = (raw) => { const f = JSON.parse(raw); if (f.type === "res" && f.id === id) { ws.off("message", h); res(f); } };
  ws.on("message", h);
  ws.send(JSON.stringify({ type: "req", id, method: m, params: p }));
});
ws.on("open", async () => {
  await call("connect", {});
  ws.on("message", (raw) => { const f = JSON.parse(raw); if (f.type === "event" && f.event !== "connect.challenge") {
    const p = f.payload || {}; console.log("EVENT", f.event, p.state || p.data?.phase || "", (p.message?.content || p.errorMessage || "").slice(-160).replace(/\n/g, " ")); } });
  const r = await call(method, paramsJson ? JSON.parse(paramsJson) : {});
  console.log(JSON.stringify(r).slice(0, 2500));
  setTimeout(() => process.exit(0), parseInt(waitMs || "0", 10));
});
