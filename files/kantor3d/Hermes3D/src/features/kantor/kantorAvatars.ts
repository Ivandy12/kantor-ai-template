// Kantor AI: Jujutsu Kaisen Edition — Agent Collectibles & Avatar Mapping
// Pimpinan: Gojo Satoru (Bos) & Geto Suguru (CEO)
// 20 Karakter Jujutsu Kaisen terbagi dalam 4 Divisi

export const BOSS_AGENT_ID = "__boss__";
export const BOSS_NAME = "Gojo Satoru";
export const BOSS_TITLE = "Gojo Satoru · Bos";
export const CEO_AGENT_ID = "__ceo__";
export const CEO_NAME = "Geto Suguru";
export const CEO_TITLE = "Geto Suguru · CEO";

export type Gender = "m" | "f";

export type AvatarConfig = {
  avatarName: string;
  gender: Gender;
  characterName: string;
  roleTitle: string;
  division: "Pimpinan" | "Penjualan & Layanan" | "Pemasaran" | "Keuangan" | "Operasional & Admin";
};

/**
 * 20 Figur Resmi Jujutsu Kaisen Agent Collectibles
 */
export const JJK_ROSTER: Record<string, AvatarConfig> = {
  // --- PIMPINAN ---
  [BOSS_AGENT_ID]: {
    avatarName: "Business_Male_01",
    gender: "m",
    characterName: "Gojo Satoru",
    roleTitle: "Bos",
    division: "Pimpinan",
  },
  "gojo satoru": {
    avatarName: "Business_Male_01",
    gender: "m",
    characterName: "Gojo Satoru",
    roleTitle: "Bos",
    division: "Pimpinan",
  },
  gojo: {
    avatarName: "Business_Male_01",
    gender: "m",
    characterName: "Gojo Satoru",
    roleTitle: "Bos",
    division: "Pimpinan",
  },

  [CEO_AGENT_ID]: {
    avatarName: "Business_Male_05",
    gender: "m",
    characterName: "Geto Suguru",
    roleTitle: "CEO",
    division: "Pimpinan",
  },
  "geto suguru": {
    avatarName: "Business_Male_05",
    gender: "m",
    characterName: "Geto Suguru",
    roleTitle: "CEO",
    division: "Pimpinan",
  },
  geto: {
    avatarName: "Business_Male_05",
    gender: "m",
    characterName: "Geto Suguru",
    roleTitle: "CEO",
    division: "Pimpinan",
  },
  // Backward compatibility alias jika masih ada instance lama
  arga: {
    avatarName: "Business_Male_05",
    gender: "m",
    characterName: "Geto Suguru",
    roleTitle: "CEO",
    division: "Pimpinan",
  },

  // --- PENJUALAN & LAYANAN ---
  "yuta okkotsu": {
    avatarName: "Male_Adult_01",
    gender: "m",
    characterName: "Yuta Okkotsu",
    roleTitle: "CS & Sales",
    division: "Penjualan & Layanan",
  },
  yuta: {
    avatarName: "Male_Adult_01",
    gender: "m",
    characterName: "Yuta Okkotsu",
    roleTitle: "CS & Sales",
    division: "Penjualan & Layanan",
  },
  ijichi: {
    avatarName: "Business_Male_02",
    gender: "m",
    characterName: "Ijichi",
    roleTitle: "Booking & Jadwal",
    division: "Penjualan & Layanan",
  },
  "yuji itadori": {
    avatarName: "Male_Adult_02",
    gender: "m",
    characterName: "Yuji Itadori",
    roleTitle: "Reaktivasi Pelanggan",
    division: "Penjualan & Layanan",
  },
  yuji: {
    avatarName: "Male_Adult_02",
    gender: "m",
    characterName: "Yuji Itadori",
    roleTitle: "Reaktivasi Pelanggan",
    division: "Penjualan & Layanan",
  },
  itadori: {
    avatarName: "Male_Adult_02",
    gender: "m",
    characterName: "Yuji Itadori",
    roleTitle: "Reaktivasi Pelanggan",
    division: "Penjualan & Layanan",
  },
  "nobara kugisaki": {
    avatarName: "Business_Female_01",
    gender: "f",
    characterName: "Nobara Kugisaki",
    roleTitle: "Ulasan & Reputasi",
    division: "Penjualan & Layanan",
  },
  nobara: {
    avatarName: "Business_Female_01",
    gender: "f",
    characterName: "Nobara Kugisaki",
    roleTitle: "Ulasan & Reputasi",
    division: "Penjualan & Layanan",
  },
  "nanami kento": {
    avatarName: "Business_Male_03",
    gender: "m",
    characterName: "Nanami Kento",
    roleTitle: "Penawaran Harga",
    division: "Penjualan & Layanan",
  },
  nanami: {
    avatarName: "Business_Male_03",
    gender: "m",
    characterName: "Nanami Kento",
    roleTitle: "Penawaran Harga",
    division: "Penjualan & Layanan",
  },

  // --- PEMASARAN ---
  "todo aoi": {
    avatarName: "Male_Adult_03",
    gender: "m",
    characterName: "Todo Aoi",
    roleTitle: "Konten Sosmed",
    division: "Pemasaran",
  },
  todo: {
    avatarName: "Male_Adult_03",
    gender: "m",
    characterName: "Todo Aoi",
    roleTitle: "Konten Sosmed",
    division: "Pemasaran",
  },
  "hakari kinji": {
    avatarName: "Business_Male_04",
    gender: "m",
    characterName: "Hakari Kinji",
    roleTitle: "Meta Ads",
    division: "Pemasaran",
  },
  hakari: {
    avatarName: "Business_Male_04",
    gender: "m",
    characterName: "Hakari Kinji",
    roleTitle: "Meta Ads",
    division: "Pemasaran",
  },
  panda: {
    avatarName: "Business_Male_07",
    gender: "m",
    characterName: "Panda",
    roleTitle: "Video Pendek",
    division: "Pemasaran",
  },
  "inumaki toge": {
    avatarName: "Male_Adult_01",
    gender: "m",
    characterName: "Inumaki Toge",
    roleTitle: "Email & Newsletter",
    division: "Pemasaran",
  },
  inumaki: {
    avatarName: "Male_Adult_01",
    gender: "m",
    characterName: "Inumaki Toge",
    roleTitle: "Email & Newsletter",
    division: "Pemasaran",
  },
  "megumi fushiguro": {
    avatarName: "Business_Male_06",
    gender: "m",
    characterName: "Megumi Fushiguro",
    roleTitle: "SEO / AIO / GEO / AEO",
    division: "Pemasaran",
  },
  megumi: {
    avatarName: "Business_Male_06",
    gender: "m",
    characterName: "Megumi Fushiguro",
    roleTitle: "SEO / AIO / GEO / AEO",
    division: "Pemasaran",
  },
  fushiguro: {
    avatarName: "Business_Male_06",
    gender: "m",
    characterName: "Megumi Fushiguro",
    roleTitle: "SEO / AIO / GEO / AEO",
    division: "Pemasaran",
  },

  // --- KEUANGAN ---
  "maki zenin": {
    avatarName: "Business_Female_02",
    gender: "f",
    characterName: "Maki Zenin",
    roleTitle: "Penagihan",
    division: "Keuangan",
  },
  maki: {
    avatarName: "Business_Female_02",
    gender: "f",
    characterName: "Maki Zenin",
    roleTitle: "Penagihan",
    division: "Keuangan",
  },
  "mei mei": {
    avatarName: "Female_Adult_01",
    gender: "f",
    characterName: "Mei Mei",
    roleTitle: "Settlement F&B",
    division: "Keuangan",
  },
  meimei: {
    avatarName: "Female_Adult_01",
    gender: "f",
    characterName: "Mei Mei",
    roleTitle: "Settlement F&B",
    division: "Keuangan",
  },
  "yuki tsukumo": {
    avatarName: "Female_Adult_02",
    gender: "f",
    characterName: "Yuki Tsukumo",
    roleTitle: "Laporan Pemilik",
    division: "Keuangan",
  },
  yuki: {
    avatarName: "Female_Adult_02",
    gender: "f",
    characterName: "Yuki Tsukumo",
    roleTitle: "Laporan Pemilik",
    division: "Keuangan",
  },
  "utahime iori": {
    avatarName: "Business_Female_03",
    gender: "f",
    characterName: "Utahime Iori",
    roleTitle: "Pajak",
    division: "Keuangan",
  },
  utahime: {
    avatarName: "Business_Female_03",
    gender: "f",
    characterName: "Utahime Iori",
    roleTitle: "Pajak",
    division: "Keuangan",
  },
  "yaga masamichi": {
    avatarName: "Business_Male_05",
    gender: "m",
    characterName: "Yaga Masamichi",
    roleTitle: "Akuntansi",
    division: "Keuangan",
  },
  yaga: {
    avatarName: "Business_Male_05",
    gender: "m",
    characterName: "Yaga Masamichi",
    roleTitle: "Akuntansi",
    division: "Keuangan",
  },

  // --- OPERASIONAL & ADMIN ---
  "shoko ieiri": {
    avatarName: "Business_Female_04",
    gender: "f",
    characterName: "Shoko Ieiri",
    roleTitle: "Cek Bukti Bayar",
    division: "Operasional & Admin",
  },
  shoko: {
    avatarName: "Business_Female_04",
    gender: "f",
    characterName: "Shoko Ieiri",
    roleTitle: "Cek Bukti Bayar",
    division: "Operasional & Admin",
  },
  choso: {
    avatarName: "Male_Adult_02",
    gender: "m",
    characterName: "Choso",
    roleTitle: "Komentar & DM",
    division: "Operasional & Admin",
  },
  "mai zenin": {
    avatarName: "Business_Female_01",
    gender: "f",
    characterName: "Mai Zenin",
    roleTitle: "Admin Pesanan",
    division: "Operasional & Admin",
  },
  mai: {
    avatarName: "Business_Female_01",
    gender: "f",
    characterName: "Mai Zenin",
    roleTitle: "Admin Pesanan",
    division: "Operasional & Admin",
  },
  "higuruma hiromi": {
    avatarName: "Business_Male_02",
    gender: "m",
    characterName: "Higuruma Hiromi",
    roleTitle: "Dokumen & Kontrak",
    division: "Operasional & Admin",
  },
  higuruma: {
    avatarName: "Business_Male_02",
    gender: "m",
    characterName: "Higuruma Hiromi",
    roleTitle: "Dokumen & Kontrak",
    division: "Operasional & Admin",
  },
  tengen: {
    avatarName: "Female_Adult_01",
    gender: "f",
    characterName: "Tengen",
    roleTitle: "Keamanan Web",
    division: "Operasional & Admin",
  },
};

/**
 * Daftar karakter Jujutsu Kaisen untuk rekrutmen karyawan baru secara acak
 */
export const RECRUITABLE_JJK_CHARACTERS = [
  "Yuta Okkotsu",
  "Ijichi",
  "Yuji Itadori",
  "Nobara Kugisaki",
  "Nanami Kento",
  "Todo Aoi",
  "Hakari Kinji",
  "Panda",
  "Inumaki Toge",
  "Megumi Fushiguro",
  "Maki Zenin",
  "Mei Mei",
  "Yuki Tsukumo",
  "Utahime Iori",
  "Yaga Masamichi",
  "Shoko Ieiri",
  "Choso",
  "Mai Zenin",
  "Higuruma Hiromi",
  "Tengen",
];

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

export function getRandomJJKCharacter(excludeNames: string[] = []): { name: string; title: string; division: string } {
  const available = RECRUITABLE_JJK_CHARACTERS.filter((c) => !excludeNames.includes(c));
  const pick = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : RECRUITABLE_JJK_CHARACTERS[Math.floor(Math.random() * RECRUITABLE_JJK_CHARACTERS.length)];
  const cfg = JJK_ROSTER[pick.toLowerCase()];
  return {
    name: cfg?.characterName || pick,
    title: cfg?.roleTitle || "Staff Jujutsu",
    division: cfg?.division || "Operasional & Admin",
  };
}

export function getAvatarInfo(agentId: string, name?: string): AvatarConfig & { avatarUrl: string } {
  const normId = (agentId || "").toLowerCase().trim();
  const normName = (name || "").toLowerCase().trim();

  // 1. Cek langsung map roster Jujutsu Kaisen
  let found = JJK_ROSTER[normId] || (normName ? JJK_ROSTER[normName] : undefined);

  // 2. Cek apakah ada nama karakter Jujutsu Kaisen di dalam nama agent
  if (!found && normName) {
    for (const [key, conf] of Object.entries(JJK_ROSTER)) {
      if (normName.includes(key) || key.includes(normName)) {
        found = conf;
        break;
      }
    }
  }

  // 3. Jika belum ditemukan (agen kustom yang baru direkrut), pilihkan karakter acak JJK
  if (!found) {
    let hash = 0;
    const str = normName || normId || "agent";
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % RECRUITABLE_JJK_CHARACTERS.length;
    const charName = RECRUITABLE_JJK_CHARACTERS[idx];
    found = JJK_ROSTER[charName.toLowerCase()] || {
      avatarName: "Business_Male_02",
      gender: "m",
      characterName: charName,
      roleTitle: "Staff",
      division: "Operasional & Admin",
    };
  }

  return {
    ...found,
    avatarUrl: `/office-assets/people/avatars/${found.avatarName}.glb?v=2`,
  };
}

export function getAnimUrl(gender: Gender, animKey: string): string {
  return `/office-assets/people/anims/${gender}/${animKey}.glb?v=2`;
}
