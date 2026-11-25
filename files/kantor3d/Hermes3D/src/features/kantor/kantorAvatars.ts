// Kantor AI: Mapping karakter & animasi Rocketbox sesuai gender (T9b, T11)

export const BOSS_AGENT_ID = "__boss__";
export const BOSS_NAME = "Pak Fauzy";
export const BOSS_TITLE = "Pak Fauzy · Bos";

export type Gender = "m" | "f";

export type AvatarConfig = {
  avatarName: string;
  gender: Gender;
};

/**
 * Mapping eksplisit nama / ID agent ke model avatar Rocketbox & gender.
 * Aturan T9b:
 * - Pak Fauzy (user/bos) -> Business_Male_01 (jas hitam dasi merah)
 * - Arga (CEO) -> Business_Male_05 (jas kotak dasi ungu)
 * - Bima (Head Meta Ads) -> Business_Male_03
 * - Agent wanita: AM Maikha, Laras, Rani, Sekar -> Business_Female_01..04
 * - Sisanya pria: AM Fauzy, AM Edio, AM Nurrahman, AM Zacky, Bayu, Dimas, Gatot, Radit, Raka -> Business_Male_*, Male_Adult_*
 * Pak Fauzy, Arga, Bima TIDAK boleh dobel dengan agent mana pun.
 */
export const AGENT_AVATAR_MAP: Record<string, AvatarConfig> = {
  // Boss
  [BOSS_AGENT_ID]: { avatarName: "Business_Male_01", gender: "m" },
  "pak fauzy": { avatarName: "Business_Male_01", gender: "m" },
  fauzy_boss: { avatarName: "Business_Male_01", gender: "m" },

  // Pimpinan & Head
  arga: { avatarName: "Business_Male_05", gender: "m" },
  bima: { avatarName: "Business_Male_03", gender: "m" },

  // Tim Meta Ads
  "am fauzy": { avatarName: "Business_Male_02", gender: "m" },
  "am edio": { avatarName: "Business_Male_04", gender: "m" },
  "am maikha": { avatarName: "Business_Female_01", gender: "f" },
  "am nurrahman": { avatarName: "Business_Male_06", gender: "m" },
  "am zacky": { avatarName: "Business_Male_07", gender: "m" },

  // Tim Operasional & Kreatif
  bayu: { avatarName: "Male_Adult_01", gender: "m" },
  gatot: { avatarName: "Male_Adult_02", gender: "m" },
  dimas: { avatarName: "Male_Adult_03", gender: "m" },
  laras: { avatarName: "Business_Female_02", gender: "f" },
  rani: { avatarName: "Business_Female_03", gender: "f" },
  sekar: { avatarName: "Business_Female_04", gender: "f" },
  radit: { avatarName: "Business_Male_02", gender: "m" },
  raka: { avatarName: "Business_Male_04", gender: "m" },
};

export const ALL_AVATARS = [
  "Business_Female_01",
  "Business_Female_02",
  "Business_Female_03",
  "Business_Female_04",
  "Female_Adult_01",
  "Female_Adult_02",
  "Business_Male_01",
  "Business_Male_02",
  "Business_Male_03",
  "Business_Male_04",
  "Business_Male_05",
  "Business_Male_06",
  "Business_Male_07",
  "Male_Adult_01",
  "Male_Adult_02",
  "Male_Adult_03",
] as const;

// Claude v1.3: deteksi gender dari nama (kata utuh), supaya agent baru bernama perempuan dapat karakter perempuan
const FEMALE_NAMES = new Set([
  "maya", "sora", "laras", "rani", "sekar", "maikha", "putri", "siti", "ayu", "dewi", "sari", "rina", "rini", "nina",
  "tia", "dina", "lina", "wulan", "indah", "citra", "nadia", "nisa", "anisa", "annisa", "salsa", "salsabila", "bella",
  "intan", "fitri", "fitria", "aulia", "kirana", "alya", "zahra", "nabila", "aisyah", "aisha", "sinta", "shinta", "tari",
  "lestari", "ratna", "yuni", "vina", "mega", "tasya", "kezia", "gita", "ani", "ana", "anna", "eka", "lia", "lili",
  "mira", "mila", "nia", "novi", "novita", "oktavia", "puspita", "rara", "risa", "riska", "rizka", "santi", "shinta",
  "suci", "tiara", "tika", "vira", "widya", "yanti", "yulia", "zara", "amelia", "amel", "angel", "anggun", "astrid",
  "bunga", "cantika", "dara", "dita", "elsa", "farah", "febi", "hana", "hani", "ika", "ira", "jessica", "julia",
  "kartika", "keisha", "kinan", "laila", "layla", "luna", "melati", "mutiara", "naya", "nayla", "olivia", "pevita",
  "qonita", "raisa", "rania", "reni", "sasha", "sekarayu", "sofia", "sophia", "tanya", "ulfa", "vania", "winda",
  "yasmin", "zalfa", "clara", "diana", "erika", "felicia", "grace", "helena", "karina", "kayla", "lisa", "lucy",
  "maria", "michelle", "nadya", "sarah", "sara", "stella", "vanessa", "dinda", "devi", "desi", "fani", "fanny",
  "rosa", "rose", "aurel", "ayla", "kiara", "sabrina", "alisha", "cinta", "dian", "ratih", "wati", "ningsih",
]);
const FEMALE_WORDS = /\b(wanita|perempuan|female|ibu|bu|mbak|nona)\b/i;

export function guessGender(name: string): Gender {
  const n = (name || "").toLowerCase();
  if (FEMALE_WORDS.test(n)) return "f";
  const words = n.replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w && !["am", "pak", "mas", "bang", "ceo", "head", "agent"].includes(w));
  return words.some((w) => FEMALE_NAMES.has(w)) ? "f" : "m";
}

export function getAvatarInfo(agentId: string, name?: string): AvatarConfig & { avatarUrl: string } {
  const normId = (agentId || "").toLowerCase().trim();
  const normName = (name || "").toLowerCase().trim();

  // 1. Cek langsung map
  let found = AGENT_AVATAR_MAP[normId] || (normName ? AGENT_AVATAR_MAP[normName] : undefined);

  // 2. Cek nama per kata utuh (dulu substring: "margareta" bisa kena "arga")
  if (!found && normName) {
    const padded = ` ${normName.replace(/[^a-z0-9]+/g, " ")} `;
    for (const [key, conf] of Object.entries(AGENT_AVATAR_MAP)) {
      if (padded.includes(` ${key} `)) {
        found = conf;
        break;
      }
    }
  }

  // 3. Agent baru: gender dari nama, avatar dipilih deterministik (tidak pakai avatar khusus bos/Arga/Bima)
  if (!found) {
    const gender = guessGender(normName || normId);
    const pool = gender === "f"
      ? ["Business_Female_01", "Business_Female_02", "Business_Female_03", "Business_Female_04", "Female_Adult_01", "Female_Adult_02"]
      : ["Business_Male_02", "Business_Male_04", "Business_Male_06", "Business_Male_07", "Male_Adult_01", "Male_Adult_02", "Male_Adult_03"];

    let hash = 0;
    const str = normName || normId || "agent";
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const avatarName = pool[Math.abs(hash) % pool.length];
    found = { avatarName, gender };
  }

  return {
    ...found,
    avatarUrl: `/office-assets/people/avatars/${found.avatarName}.glb?v=2`,
  };
}

export function getAnimUrl(gender: Gender, animKey: string): string {
  return `/office-assets/people/anims/${gender}/${animKey}.glb?v=2`;
}
