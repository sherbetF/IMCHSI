export type FacilityCategory =
  "Hospital" | "Klinik Kesihatan" | "Klinik Kesihatan Ibu & Anak" | "Klinik Desa";

export interface CanonicalFacility {
  facilityId: string;
  facilityName: string;
  category: FacilityCategory;
}

export const CANONICAL_FACILITIES: CanonicalFacility[] = [
  // Hospital (4)
  {
    facilityId: "hospital_kota_tinggi",
    facilityName: "Hospital Kota Tinggi",
    category: "Hospital",
  },
  {
    facilityId: "hospital_pasir_gudang",
    facilityName: "Hospital Pasir Gudang",
    category: "Hospital",
  },
  { facilityId: "hospital_mersing", facilityName: "Hospital Mersing", category: "Hospital" },
  { facilityId: "hospital_kluang", facilityName: "Hospital Kluang", category: "Hospital" },

  // Klinik Kesihatan (23)
  { facilityId: "kk_air_tawar_2", facilityName: "KK Air Tawar 2", category: "Klinik Kesihatan" },
  { facilityId: "kk_air_tawar_5", facilityName: "KK Air Tawar 5", category: "Klinik Kesihatan" },
  { facilityId: "kk_bandar_mas", facilityName: "KK Bandar Mas", category: "Klinik Kesihatan" },
  {
    facilityId: "kk_bandar_penawar",
    facilityName: "KK Bandar Penawar",
    category: "Klinik Kesihatan",
  },
  {
    facilityId: "kk_bandar_tenggara",
    facilityName: "KK Bandar Tenggara",
    category: "Klinik Kesihatan",
  },
  { facilityId: "kk_bayu_damai", facilityName: "KK Bayu Damai", category: "Klinik Kesihatan" },
  { facilityId: "kk_bukit_besar", facilityName: "KK Bukit Besar", category: "Klinik Kesihatan" },
  { facilityId: "kk_bukit_waha", facilityName: "KK Bukit Waha", category: "Klinik Kesihatan" },
  { facilityId: "kk_endau", facilityName: "KK Endau", category: "Klinik Kesihatan" },
  { facilityId: "kk_jemaluang", facilityName: "KK Jemaluang", category: "Klinik Kesihatan" },
  {
    facilityId: "kk_kahang_batu_22",
    facilityName: "KK Kahang Batu 22",
    category: "Klinik Kesihatan",
  },
  {
    facilityId: "kk_kampung_cahaya_baru",
    facilityName: "KK Kampung Cahaya Baru",
    category: "Klinik Kesihatan",
  },
  { facilityId: "kk_lok_heng", facilityName: "KK Lok Heng", category: "Klinik Kesihatan" },
  { facilityId: "kk_masai", facilityName: "KK Masai", category: "Klinik Kesihatan" },
  {
    facilityId: "kk_mersing_kanan",
    facilityName: "KK Mersing Kanan",
    category: "Klinik Kesihatan",
  },
  { facilityId: "kk_nitar_1", facilityName: "KK Nitar 1", category: "Klinik Kesihatan" },
  { facilityId: "kk_pasir_gudang", facilityName: "KK Pasir Gudang", category: "Klinik Kesihatan" },
  { facilityId: "kk_pengerang", facilityName: "KK Pengerang", category: "Klinik Kesihatan" },
  { facilityId: "kk_sedili_besar", facilityName: "KK Sedili Besar", category: "Klinik Kesihatan" },
  { facilityId: "kk_sening", facilityName: "KK Sening", category: "Klinik Kesihatan" },
  {
    facilityId: "kk_sultan_ismail",
    facilityName: "KK Sultan Ismail",
    category: "Klinik Kesihatan",
  },
  {
    facilityId: "kk_sungai_rengit",
    facilityName: "KK Sungai Rengit",
    category: "Klinik Kesihatan",
  },
  {
    facilityId: "kk_tanjong_sedili",
    facilityName: "KK Tanjong Sedili",
    category: "Klinik Kesihatan",
  },
  { facilityId: "kk_tenggaroh_2", facilityName: "KK Tenggaroh 2", category: "Klinik Kesihatan" },
  { facilityId: "kk_tenglu", facilityName: "KK Tenglu", category: "Klinik Kesihatan" },
  { facilityId: "kk_ulu_tiram", facilityName: "KK Ulu Tiram", category: "Klinik Kesihatan" },
  {
    facilityId: "klinik_kesihatan_bandar_kota_tinggi",
    facilityName: "Klinik Kesihatan Bandar Kota Tinggi",
    category: "Klinik Kesihatan",
  },

  // Klinik Kesihatan Ibu & Anak (3)
  {
    facilityId: "kkia_jalan_tun_habab",
    facilityName: "KKIA Jalan Tun Habab",
    category: "Klinik Kesihatan Ibu & Anak",
  },
  {
    facilityId: "kkia_jalan_abd_samad",
    facilityName: "KKIA Jalan Abd Samad",
    category: "Klinik Kesihatan Ibu & Anak",
  },
  {
    facilityId: "kkia_sultan_ismail_nanyang",
    facilityName: "KKIA Sultan Ismail ( Nanyang)",
    category: "Klinik Kesihatan Ibu & Anak",
  },

  // Klinik Desa (50)
  { facilityId: "kd_air_tawar_1", facilityName: "KD Air Tawar 1", category: "Klinik Desa" },
  { facilityId: "kd_air_tawar_3", facilityName: "KD Air Tawar 3", category: "Klinik Desa" },
  { facilityId: "kd_air_tawar_4", facilityName: "KD Air Tawar 4", category: "Klinik Desa" },
  { facilityId: "kd_aping_barat", facilityName: "KD Aping Barat", category: "Klinik Desa" },
  { facilityId: "kd_aping_timur", facilityName: "KD Aping Timur", category: "Klinik Desa" },
  { facilityId: "kd_batu_4", facilityName: "KD Batu 4", category: "Klinik Desa" },
  { facilityId: "kd_bukit_ramun", facilityName: "KD Bukit Ramun", category: "Klinik Desa" },
  { facilityId: "kd_felda_endau", facilityName: "KD Felda Endau", category: "Klinik Desa" },
  { facilityId: "kd_gembut", facilityName: "KD Gembut", category: "Klinik Desa" },
  { facilityId: "kd_kangkar_tebrau", facilityName: "KD Kangkar Tebrau", category: "Klinik Desa" },
  { facilityId: "kd_kampung_hubong", facilityName: "KD Kampung Hubong", category: "Klinik Desa" },
  { facilityId: "kd_kampung_linting", facilityName: "KD Kampung Linting", category: "Klinik Desa" },
  { facilityId: "kd_kong_kong_laut", facilityName: "KD Kong Kong Laut", category: "Klinik Desa" },
  {
    facilityId: "kd_kuala_sedili_kecil",
    facilityName: "KD Kuala Sedili Kecil",
    category: "Klinik Desa",
  },
  { facilityId: "kd_linggiu", facilityName: "KD Linggiu", category: "Klinik Desa" },
  { facilityId: "kd_maju_jaya", facilityName: "KD Maju Jaya", category: "Klinik Desa" },
  { facilityId: "kd_mawai_baru", facilityName: "KD Mawai Baru", category: "Klinik Desa" },
  { facilityId: "kd_nitar_2_felda", facilityName: "KD Nitar 2 (Felda)", category: "Klinik Desa" },
  { facilityId: "kd_pasak", facilityName: "KD Pasak", category: "Klinik Desa" },
  { facilityId: "kd_pasir_gogok", facilityName: "KD Pasir Gogok", category: "Klinik Desa" },
  { facilityId: "kd_pasir_putih", facilityName: "KD Pasir Putih", category: "Klinik Desa" },
  { facilityId: "kd_pasir_raja", facilityName: "KD Pasir Raja", category: "Klinik Desa" },
  { facilityId: "kd_permas_jaya", facilityName: "KD Permas Jaya", category: "Klinik Desa" },
  { facilityId: "kd_petri_jaya", facilityName: "KD Petri Jaya", category: "Klinik Desa" },
  { facilityId: "kd_plentong", facilityName: "KD Plentong", category: "Klinik Desa" },
  { facilityId: "kd_pulau_aur", facilityName: "KD Pulau Aur", category: "Klinik Desa" },
  { facilityId: "kd_pulau_pemanggil", facilityName: "KD Pulau Pemanggil", category: "Klinik Desa" },
  { facilityId: "kd_pulau_sibu", facilityName: "KD Pulau Sibu", category: "Klinik Desa" },
  { facilityId: "kd_pulau_tinggi", facilityName: "KD Pulau Tinggi", category: "Klinik Desa" },
  { facilityId: "kd_punggai", facilityName: "KD Punggai", category: "Klinik Desa" },
  { facilityId: "kd_sawah_datok", facilityName: "KD Sawah Datok", category: "Klinik Desa" },
  { facilityId: "kd_semanggar", facilityName: "KD Semanggar", category: "Klinik Desa" },
  { facilityId: "kd_semenchu", facilityName: "KD Semenchu", category: "Klinik Desa" },
  { facilityId: "kd_sg_telor", facilityName: "KD Sg Telor", category: "Klinik Desa" },
  { facilityId: "kd_sri_pantai", facilityName: "KD Sri Pantai", category: "Klinik Desa" },
  { facilityId: "kd_sungai_ara", facilityName: "KD Sungai Ara", category: "Klinik Desa" },
  { facilityId: "kd_sungai_sayong", facilityName: "KD Sungai Sayong", category: "Klinik Desa" },
  { facilityId: "kd_sungai_sibol", facilityName: "KD Sungai Sibol", category: "Klinik Desa" },
  { facilityId: "kd_sungai_tiram", facilityName: "KD Sungai Tiram", category: "Klinik Desa" },
  { facilityId: "kd_tanjong_buai", facilityName: "KD Tanjong Buai", category: "Klinik Desa" },
  { facilityId: "kd_tanjong_langsat", facilityName: "KD Tanjong Langsat", category: "Klinik Desa" },
  {
    facilityId: "kd_tanjong_serindit",
    facilityName: "KD Tanjong Serindit",
    category: "Klinik Desa",
  },
  { facilityId: "kd_telok_sengat", facilityName: "KD Telok Sengat", category: "Klinik Desa" },
  { facilityId: "kd_teluk_ramunia", facilityName: "KD Teluk Ramunia", category: "Klinik Desa" },
  {
    facilityId: "kd_tenggaroh_1_felda",
    facilityName: "KD Tenggaroh 1 (Felda)",
    category: "Klinik Desa",
  },
  {
    facilityId: "kd_tenggaroh_5_felda",
    facilityName: "KD Tenggaroh 5 (Felda)",
    category: "Klinik Desa",
  },
  {
    facilityId: "kd_tenggaroh_selatan_1",
    facilityName: "KD Tenggaroh Selatan 1",
    category: "Klinik Desa",
  },
  { facilityId: "kd_tiram_duku", facilityName: "KD Tiram Duku", category: "Klinik Desa" },
  { facilityId: "kd_triang", facilityName: "KD Triang", category: "Klinik Desa" },
  { facilityId: "kd_ulu_tebrau", facilityName: "KD Ulu Tebrau", category: "Klinik Desa" },
];
