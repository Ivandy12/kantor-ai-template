#!/usr/bin/env node
// Kantor AI — riset Meta Ad Library tanpa login (browser headless).
// Pakai: adlib "kata kunci" [--negara ID] [--maks 60] [--json]
// Output: ringkasan pengiklan + daftar iklan (teks, tanggal mulai, domain, harga yang disebut).
const path = require("path");
const fs = require("fs");
process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/data/.cache/ms-playwright";
const PW = ["/opt/data/kantor3d/Hermes3D/node_modules/playwright", "playwright"];
let chromium;
for (const p of PW) { try { ({ chromium } = require(p)); break; } catch {} }
if (!chromium) { console.error("ERROR playwright tidak ditemukan. Jalankan: bash /opt/data/kantor/tools/adlib-setup.sh"); process.exit(2); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const q = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))).join(" ").trim();
if (!q) { console.error('Pakai: adlib "kata kunci" [--negara ID] [--maks 60] [--json]'); process.exit(1); }
const negara = opt("--negara", "ID"), maks = parseInt(opt("--maks", "60"), 10), asJson = args.includes("--json");

(async () => {
  const b = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await b.newPage({ locale: "en-GB", viewport: { width: 1280, height: 1800 } });
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(negara)}` +
      `&q=${encodeURIComponent(q)}&search_type=keyword_unordered&media_type=all&sort_data[mode]=total_impressions&sort_data[direction]=desc`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(1800); }
    const data = await page.evaluate((maks) => {
      const one = [...document.querySelectorAll("div")].filter((d) => (d.innerText || "").includes("Sponsored") && ((d.innerText || "").match(/Library ID/g) || []).length === 1);
      const best = one.filter((d) => ![...d.children].some((ch) => one.includes(ch)));
      const seen = new Set(), ads = [];
      for (const c of best) {
        const t = c.innerText; const id = (t.match(/Library ID:?\s*(\d+)/) || [])[1];
        if (!id || seen.has(id)) continue; seen.add(id);
        const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
        const i = lines.indexOf("Sponsored");
        const body = lines.slice(i + 1).filter((l) => !/^\d+:\d+ \/ \d+:\d+$/.test(l)).join(" ").slice(0, 600);
        ads.push({
          id, pengiklan: lines[i - 1] || "", mulai: (t.match(/Started running on ([^\n]+)/) || [])[1] || "",
          varian: (t.match(/(\d+) ads use this creative/) || [])[1] || "1",
          domain: [...new Set([...t.matchAll(/\b([A-Z0-9-]+\.(?:COM|ID|CO\.ID|MY\.ID|SITE|STORE|NET|ORG|SHOP|LINK))\b/g)].map((m) => m[1].toLowerCase()))],
          harga: [...new Set([...t.matchAll(/Rp\s?[\d.]+(?:,\d+)?/g)].map((m) => m[0]))],
          teks: body,
        });
        if (ads.length >= maks) break;
      }
      const total = (document.body.innerText.match(/~?([\d,.]+) results/) || [])[1] || "";
      return { total, ads };
    }, maks);
    const per = {};
    for (const a of data.ads) { per[a.pengiklan] = per[a.pengiklan] || { iklan: 0, sejak: a.mulai }; per[a.pengiklan].iklan++; }
    const ringkas = Object.entries(per).sort((a, b) => b[1].iklan - a[1].iklan);
    if (asJson) { console.log(JSON.stringify({ kata_kunci: q, negara, total_hasil: data.total, pengiklan: ringkas, iklan: data.ads }, null, 1)); return; }
    console.log(`# Ad Library: "${q}" (${negara}, aktif, urut impresi) — total hasil ±${data.total || "?"}, dianalisis ${data.ads.length} iklan\n`);
    console.log("## Pengiklan teratas");
    for (const [n, v] of ringkas.slice(0, 15)) console.log(`- ${n}: ${v.iklan} iklan (contoh mulai ${v.sejak})`);
    console.log("\n## Iklan");
    for (const a of data.ads) console.log(`- [${a.pengiklan}] mulai ${a.mulai} · ${a.varian} varian${a.harga.length ? " · harga " + a.harga.join(", ") : ""}${a.domain.length ? " · " + a.domain.join(", ") : ""}\n  ${a.teks}`);
    if (!data.ads.length) console.log("(tidak ada iklan terbaca — coba kata kunci lain atau ulangi sebentar lagi)");
  } finally { await b.close(); }
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
