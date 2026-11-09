/**
 * Utility functions for generating standardized appointment IDs in the format:
 * AAAA-BBBB-CCCC
 * - AAAA: Test name code (e.g. EST, HOLTER, ECHO, ABPM, LFT, OUT)
 * - BBBB: Facility name code (e.g. HKT, HPG, KKPG, HSI, KPJ)
 * - CCCC: 4-digit number (e.g. 3716)
 */

export const KNOWN_FACILITY_CODES: Record<string, string> = {
  // Hospitals
  hospital_kota_tinggi: "HKT",
  hospital_pasir_gudang: "HPG",
  hospital_mersing: "HMS",
  hospital_kluang: "HKL",
  hospital_sultan_ismail: "HSI",
  hsi_admin: "HSI",

  // Klinik Kesihatan
  kk_air_tawar_2: "KKAT2",
  kk_air_tawar_5: "KKAT5",
  kk_bandar_mas: "KKBM",
  kk_bandar_penawar: "KKBP",
  kk_bandar_tenggara: "KKBT",
  kk_bayu_damai: "KKBD",
  kk_bukit_besar: "KKBB",
  kk_bukit_waha: "KKBW",
  kk_endau: "KKEN",
  kk_jemaluang: "KKJM",
  kk_kahang_batu_22: "KKB22",
  kk_kampung_cahaya_baru: "KKCB",
  kk_lok_heng: "KKLH",
  kk_masai: "KKM",
  kk_mersing_kanan: "KKMK",
  kk_nitar_1: "KKNT1",
  kk_pasir_gudang: "KKPG",
  kk_pengerang: "KKPGR",
  kk_sedili_besar: "KKSB",
  kk_sening: "KKSN",
  kk_sultan_ismail: "KKSI",
  kk_sungai_rengit: "KKSR",
  kk_tanjong_sedili: "KKTS",
  kk_tenggaroh_2: "KKT2",
  kk_tenglu: "KKTL",
  kk_ulu_tiram: "KKUT",
  klinik_kesihatan_bandar_kota_tinggi: "KKBKT",

  // KKIA
  kkia_jalan_tun_habab: "KKIATH",
  kkia_jalan_abd_samad: "KKIAAS",
  kkia_sultan_ismail_nanyang: "KKIASI",

  // Klinik Desa (KD)
  kd_air_tawar_1: "KDAT1",
  kd_air_tawar_3: "KDAT3",
  kd_air_tawar_4: "KDAT4",
  kd_aping_barat: "KDAB",
  kd_aping_timur: "KDAT",
  kd_batu_4: "KDB4",
  kd_bukit_ramun: "KDBR",
  kd_felda_endau: "KDFE",
  kd_gembut: "KDGM",
  kd_kangkar_tebrau: "KDKT",
  kd_kampung_hubong: "KDKH",
  kd_kampung_linting: "KDKL",
  kd_kong_kong_laut: "KDKKL",
  kd_kuala_sedili_kecil: "KDKSK",
  kd_linggiu: "KDLG",
  kd_maju_jaya: "KDMJ",
  kd_mawai_baru: "KDMB",
  kd_nitar_2_felda: "KDNT2",
  kd_pasak: "KDPSK",
  kd_pasir_gogok: "KDPG",
  kd_pasir_putih: "KDPP",
  kd_pasir_raja: "KDPR",
  kd_permas_jaya: "KDPJ",
  kd_petri_jaya: "KDPJ2",
  kd_plentong: "KDPL",
  kd_pulau_aur: "KDPA",
  kd_pulau_pemanggil: "KDPP2",
  kd_pulau_sibu: "KDPS",
  kd_pulau_tinggi: "KDPT",
  kd_punggai: "KDPNG",
  kd_sawah_datok: "KDSD",
  kd_semanggar: "KDSMG",
  kd_semenchu: "KDSM",
  kd_sg_telor: "KDST",
  kd_sri_pantai: "KDSP",
  kd_sungai_ara: "KDSA",
  kd_sungai_sayong: "KDSS",
  kd_sungai_sibol: "KDSS2",
  kd_sungai_tiram: "KDST2",
  kd_tanjong_buai: "KDTB",
  kd_tanjong_langsat: "KDTL",
  kd_tanjong_serindit: "KDTS",
  kd_telok_sengat: "KDTS2",
  kd_teluk_ramunia: "KDTR",
  kd_tenggaroh_1_felda: "KDTG1",
  kd_tenggaroh_5_felda: "KDTG5",
  kd_tenggaroh_selatan_1: "KDTS1",
  kd_tiram_duku: "KDTD",
  kd_triang: "KDTRG",
  kd_ulu_tebrau: "KDUT",

  // Outsource Partners
  kpj: "KPJ",
  columbia_tebrau: "COL",
  premier_integrated_labs: "PIL",
  regency_specialist: "RSH",
};

/**
 * Derives a standardized, clean facility code (BBBB) from facility name or ID.
 */
export function getFacilityCode(facilityName?: string, facilityId?: string): string {
  // 1. Direct match on normalized facilityId
  const normalizedId = (facilityId || "").trim().toLowerCase();
  if (normalizedId && KNOWN_FACILITY_CODES[normalizedId]) {
    return KNOWN_FACILITY_CODES[normalizedId];
  }

  // 2. Direct match or keyword match on facilityName
  const name = (facilityName || "").trim();
  const upper = name.toUpperCase();

  if (upper.includes("SULTAN ISMAIL")) {
    if (upper.includes("KKIA")) return "KKIASI";
    if (upper.includes("KK ") || upper.startsWith("KK")) return "KKSI";
    return "HSI";
  }
  if (upper.includes("KOTA TINGGI")) {
    if (upper.includes("HOSPITAL")) return "HKT";
    if (upper.includes("BANDAR")) return "KKBKT";
    return "HKT";
  }
  if (upper.includes("PASIR GUDANG")) {
    if (upper.includes("HOSPITAL")) return "HPG";
    if (upper.includes("KK ") || upper.startsWith("KK")) return "KKPG";
    return "HPG";
  }
  if (upper.includes("MERSING")) {
    if (upper.includes("HOSPITAL")) return "HMS";
    if (upper.includes("KANAN")) return "KKMK";
    return "HMS";
  }
  if (upper.includes("KLUANG")) return "HKL";
  if (upper.includes("KPJ")) return "KPJ";
  if (upper.includes("COLUMBIA") || upper.includes("TEBRAU")) return "COL";
  if (upper.includes("PREMIER") || upper.includes("PIL") || upper.includes("LABS")) return "PIL";
  if (upper.includes("REGENCY")) return "RSH";

  // Check prefix for KK, KKIA, KD
  if (upper.startsWith("KKIA ")) {
    const rest = upper.slice(5).replace(/[()]/g, "").trim().split(/\s+/);
    const initials = rest.map((w) => w[0] || "").join("");
    return `KKIA${initials}`.slice(0, 6);
  }
  if (upper.startsWith("KK ")) {
    const rest = upper.slice(3).replace(/[()]/g, "").trim().split(/\s+/);
    const initials = rest.map((w) => w[0] || "").join("");
    return `KK${initials}`.slice(0, 5);
  }
  if (upper.startsWith("KD ")) {
    const rest = upper.slice(3).replace(/[()]/g, "").trim().split(/\s+/);
    const initials = rest.map((w) => w[0] || "").join("");
    return `KD${initials}`.slice(0, 5);
  }

  // General multi-word acronym
  const words = name.replace(/[()]/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const acronym = words.map((w) => w[0]!.toUpperCase()).join("");
    if (acronym.length >= 2 && acronym.length <= 5) {
      return acronym;
    }
  }

  // Single word: take first 3-4 alphanumeric characters
  const clean = upper.replace(/[^A-Z0-9]/g, "");
  if (clean.length >= 3) {
    return clean.slice(0, 4);
  }

  return clean ? clean.padEnd(3, "X") : "HSI";
}

/**
 * Generates an appointment code in the format: AAAA-BBBB-CCCC
 * - AAAA: test name (e.g. EST, HOLTER, ECHO, ABPM, LFT, OUT)
 * - BBBB: facility name code (e.g. HKT, HPG, KKPG, HSI)
 * - CCCC: 4-digit number (e.g. 3716)
 */
export function generateAppointmentId(
  testCode: string,
  facilityName?: string,
  facilityId?: string,
): string {
  const facilityCode = getFacilityCode(facilityName, facilityId);
  const random4Digits = Math.floor(1000 + Math.random() * 9000);
  return `${testCode}-${facilityCode}-${random4Digits}`;
}

/**
 * Maps or reformats an appointment ID to the AAAA-BBBB-CCCC pattern.
 * If the ID is in the previous format (e.g. EST-2026-3716, HOLTER-2026-1042, ECHO-2026-8291, etc.),
 * it replaces the year (e.g. 2026, 2025, 2024, etc.) with the facility code (BBBB) derived from the facility name or facility ID.
 * If the ID is already formatted as AAAA-BBBB-CCCC with a non-year facility code, it returns it as-is.
 */
export function formatAppointmentCode(
  rawId?: string | null,
  procedureTypeOrTestCode?: string,
  facilityName?: string,
  facilityId?: string,
): string {
  if (!rawId) return "";
  const trimmed = rawId.trim();

  // Pattern: PREFIX-MIDDLE-NUMBER (e.g. EST-2026-3716, HOLTER-2026-1042, OUT-2026-8812)
  const match = trimmed.match(/^([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d{3,6})$/);
  if (match) {
    const [, prefix, middle, suffix] = match;
    const isYear = /^(19\d{2}|20\d{2})$/.test(middle);

    // If middle is a year like 2024, 2025, 2026, etc. - replace it with the facility code
    if (isYear) {
      const facilityCode = getFacilityCode(facilityName, facilityId);
      return `${prefix.toUpperCase()}-${facilityCode}-${suffix}`;
    }

    // Already has a non-year middle (e.g. EST-HKT-3716), return standardized uppercase
    return `${prefix.toUpperCase()}-${middle.toUpperCase()}-${suffix}`;
  }

  // If rawId does not have 3 parts, attempt to reconstruct AAAA-BBBB-CCCC
  const numPart = trimmed.replace(/\D/g, "").slice(-4) || "1001";
  let testCode = "EST";
  const upper = (procedureTypeOrTestCode || trimmed).toUpperCase();
  if (upper.includes("HOLTER")) testCode = "HOLTER";
  else if (upper.includes("ECHO") || upper.includes("TRANSTHORACIC")) testCode = "ECHO";
  else if (upper.includes("BLOOD") || upper.includes("ABPM") || upper.includes("PRESSURE"))
    testCode = "ABPM";
  else if (upper.includes("LUNG") || upper.includes("SPIROMETRY") || upper.includes("LFT"))
    testCode = "LFT";
  else if (upper.includes("OUTSOURCE") || upper.includes("OUT") || upper.includes("REPORT"))
    testCode = "OUT";
  else if (upper.includes("RHEUM")) testCode = "RHEUM";
  else if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    if (parts[0]) testCode = parts[0].toUpperCase();
  }

  const facilityCode = getFacilityCode(facilityName, facilityId);
  return `${testCode}-${facilityCode}-${numPart.padStart(4, "0")}`;
}
