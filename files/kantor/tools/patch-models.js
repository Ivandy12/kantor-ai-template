// Kantor: isi daftar "Choose model" (Hermes CLI) di chat/tugas Paperclip dengan model dari endpoint yang dipakai kantor
// (menu Model AI kalau sudah diterapkan, kalau belum 9Router lokal). Idempotent. Pakai: node patch-models.js [registry.js]
const fs = require("fs");
const cands = [process.argv[2],
  "/opt/data/.npm-global/lib/node_modules/paperclipai/node_modules/@paperclipai/server/dist/adapters/registry.js"].filter(Boolean);
const f = cands.find((p) => fs.existsSync(p));
if (!f) { console.log("patch-models: registry.js tidak ketemu"); process.exit(0); }
let s = fs.readFileSync(f, "utf8");
const MARK = "/* KANTOR-MODELS-PATCH */";
if (s.includes(MARK)) { console.log("patch-models: sudah terpasang"); process.exit(0); }
const anchor = "const hermesLocalAdapter = {\n    ...createHermesLocalServerAdapter(),\n";
if (!s.includes(anchor)) { console.log("patch-models: anchor tidak ketemu (versi Paperclip beda) — dilewati"); process.exit(0); }
const fn = `${MARK}
async function kantorListModels() {
    try {
        const fs = await import("node:fs");
        let base = "http://127.0.0.1:20128/v1", key = "";
        try {
            const st = JSON.parse(fs.readFileSync("/opt/data/kantor3d/state/model-ai.json", "utf8"));
            if (st.applied_at && st.base_url) { base = st.base_url; key = st.api_key || ""; }
        } catch { }
        if (!key) {
            try {
                const env = fs.readFileSync("/opt/data/profiles/kantorceo/.env", "utf8");
                const m = env.match(/^HERMES_CUSTOM_HTTP_127_0_0_1_20128_V1_API_KEY=(.*)$/m);
                if (m) key = m[1].trim().replace(/^["']|["']$/g, "");
            } catch { }
        }
        const r = await fetch(base.replace(/\\/$/, "") + "/models", { headers: key ? { Authorization: "Bearer " + key } : {}, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return [];
        const j = await r.json();
        return (j.data || []).map((m) => m && m.id).filter(Boolean).slice(0, 300).map((id) => ({ id, label: id }));
    } catch { return []; }
}
`;
s = s.replace(anchor, fn + anchor + "    listModels: kantorListModels,\n");
fs.writeFileSync(f + ".kantor-models-bak", fs.readFileSync(f));
fs.writeFileSync(f, s);
console.log("patch-models: terpasang di " + f);
