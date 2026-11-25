// Kantor: tandai run Hermes yang berhenti karena batas langkah (max turns) supaya Paperclip
// melanjutkan otomatis (max_turns_continuation) — bukan dianggap gagal lalu issue jadi blocked.
// Idempotent. Pakai: node patch-adapter.js [path execute.js]
const fs = require("fs");
const path = require("path");
const cands = [process.argv[2],
  "/opt/data/.npm-global/lib/node_modules/paperclipai/node_modules/@paperclipai/hermes-paperclip-adapter/dist/server/execute.js"].filter(Boolean);
const f = cands.find((p) => fs.existsSync(p));
if (!f) { console.log("patch-adapter: execute.js tidak ketemu"); process.exit(0); }
let s = fs.readFileSync(f, "utf8");
const MARK = "/* KANTOR-MAXTURN-PATCH */";
if (s.includes(MARK)) { console.log("patch-adapter: sudah terpasang"); process.exit(0); }
const anchor = "    // Store session ID for next run";
if (!s.includes(anchor)) { console.log("patch-adapter: anchor tidak ketemu (versi adapter beda) — dilewati"); process.exit(0); }
const code = `    ${MARK}
    try {
        const _stopFile = \`/opt/data/kantor/run-tokens/\${ctx.runId}.stop\`;
        const _stop = (await fs.readFile(_stopFile, "utf8").catch(() => "")).trim();
        if (_stop) await fs.unlink(_stopFile).catch(() => {});
        if (_stop === "max_turns_exhausted" && !result.timedOut && result.exitCode !== 0) {
            executionResult.errorCode = "max_turns_exhausted";
            executionResult.errorMessage = "Batas langkah per run habis — kerjaan dilanjutkan otomatis di run berikutnya";
            executionResult.resultJson.stopReason = "max_turns_exhausted";
            await ctx.onLog("stdout", "[kantor] Batas langkah habis, Paperclip akan melanjutkan otomatis.\\n");
        }
    } catch { }
`;
s = s.replace(anchor, code + anchor);
fs.writeFileSync(f + ".kantor-bak", fs.readFileSync(f));
fs.writeFileSync(f, s);
console.log("patch-adapter: terpasang di " + f);
