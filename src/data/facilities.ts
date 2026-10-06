export type FacilityCategory =
  "Hospital" | "Klinik Kesihatan" | "Klinik Kesihatan Ibu & Anak" | "Klinik Desa";

export interface FacilityDefinition {
  facilityId: string;
  facilityName: string;
}

export interface FacilityGroup {
  category: FacilityCategory;
  items: FacilityDefinition[];
}

export const FACILITIES_DATA: FacilityGroup[] = [
  {
    category: "Hospital",
    items: [
      { facilityId: "hospital_kota_tinggi", facilityName: "Hospital Kota Tinggi" },
      { facilityId: "hospital_pasir_gudang", facilityName: "Hospital Pasir Gudang" },
      { facilityId: "hospital_mersing", facilityName: "Hospital Mersing" },
      { facilityId: "hospital_kluang", facilityName: "Hospital Kluang" },
    ],
  },
  {
    category: "Klinik Kesihatan",
    items: [
      { facilityId: "kk_air_tawar_2", facilityName: "KK Air Tawar 2" },
      { facilityId: "kk_air_tawar_5", facilityName: "KK Air Tawar 5" },
      { facilityId: "kk_bandar_mas", facilityName: "KK Bandar Mas" },
      { facilityId: "kk_bandar_penawar", facilityName: "KK Bandar Penawar" },
      { facilityId: "kk_bandar_tenggara", facilityName: "KK Bandar Tenggara" },
      { facilityId: "kk_bayu_damai", facilityName: "KK Bayu Damai" },
      { facilityId: "kk_bukit_besar", facilityName: "KK Bukit Besar" },
      { facilityId: "kk_bukit_waha", facilityName: "KK Bukit Waha" },
      { facilityId: "kk_endau", facilityName: "KK Endau" },
      { facilityId: "kk_jemaluang", facilityName: "KK Jemaluang" },
      { facilityId: "kk_kahang_batu_22", facilityName: "KK Kahang Batu 22" },
      { facilityId: "kk_kampung_cahaya_baru", facilityName: "KK Kampung Cahaya Baru" },
      { facilityId: "kk_lok_heng", facilityName: "KK Lok Heng" },
      { facilityId: "kk_masai", facilityName: "KK Masai" },
      { facilityId: "kk_mersing_kanan", facilityName: "KK Mersing Kanan" },
      { facilityId: "kk_nitar_1", facilityName: "KK Nitar 1" },
      { facilityId: "kk_pasir_gudang", facilityName: "KK Pasir Gudang" },
      { facilityId: "kk_pengerang", facilityName: "KK Pengerang" },
      { facilityId: "kk_sedili_besar", facilityName: "KK Sedili Besar" },
      { facilityId: "kk_sening", facilityName: "KK Sening" },
      { facilityId: "kk_sultan_ismail", facilityName: "KK Sultan Ismail" },
      { facilityId: "kk_sungai_rengit", facilityName: "KK Sungai Rengit" },
      { facilityId: "kk_tanjong_sedili", facilityName: "KK Tanjong Sedili" },
      { facilityId: "kk_tenggaroh_2", facilityName: "KK Tenggaroh 2" },
      { facilityId: "kk_tenglu", facilityName: "KK Tenglu" },
      { facilityId: "kk_ulu_tiram", facilityName: "KK Ulu Tiram" },
      {
        facilityId: "klinik_kesihatan_bandar_kota_tinggi",
        facilityName: "Klinik Kesihatan Bandar Kota Tinggi",
      },
    ],
  },
  {
    category: "Klinik Kesihatan Ibu & Anak",
    items: [
      { facilityId: "kkia_jalan_tun_habab", facilityName: "KKIA Jalan Tun Habab" },
      { facilityId: "kkia_jalan_abd_samad", facilityName: "KKIA Jalan Abd Samad" },
      { facilityId: "kkia_sultan_ismail_nanyang", facilityName: "KKIA Sultan Ismail ( Nanyang)" },
    ],
  },
  {
    category: "Klinik Desa",
    items: [
      { facilityId: "kd_air_tawar_1", facilityName: "KD Air Tawar 1" },
      { facilityId: "kd_air_tawar_3", facilityName: "KD Air Tawar 3" },
      { facilityId: "kd_air_tawar_4", facilityName: "KD Air Tawar 4" },
      { facilityId: "kd_aping_barat", facilityName: "KD Aping Barat" },
      { facilityId: "kd_aping_timur", facilityName: "KD Aping Timur" },
      { facilityId: "kd_batu_4", facilityName: "KD Batu 4" },
      { facilityId: "kd_bukit_ramun", facilityName: "KD Bukit Ramun" },
      { facilityId: "kd_felda_endau", facilityName: "KD Felda Endau" },
      { facilityId: "kd_gembut", facilityName: "KD Gembut" },
      { facilityId: "kd_kangkar_tebrau", facilityName: "KD Kangkar Tebrau" },
      { facilityId: "kd_kampung_hubong", facilityName: "KD Kampung Hubong" },
      { facilityId: "kd_kampung_linting", facilityName: "KD Kampung Linting" },
      { facilityId: "kd_kong_kong_laut", facilityName: "KD Kong Kong Laut" },
      { facilityId: "kd_kuala_sedili_kecil", facilityName: "KD Kuala Sedili Kecil" },
      { facilityId: "kd_linggiu", facilityName: "KD Linggiu" },
      { facilityId: "kd_maju_jaya", facilityName: "KD Maju Jaya" },
      { facilityId: "kd_mawai_baru", facilityName: "KD Mawai Baru" },
      { facilityId: "kd_nitar_2_felda", facilityName: "KD Nitar 2 (Felda)" },
      { facilityId: "kd_pasak", facilityName: "KD Pasak" },
      { facilityId: "kd_pasir_gogok", facilityName: "KD Pasir Gogok" },
      { facilityId: "kd_pasir_putih", facilityName: "KD Pasir Putih" },
      { facilityId: "kd_pasir_raja", facilityName: "KD Pasir Raja" },
      { facilityId: "kd_permas_jaya", facilityName: "KD Permas Jaya" },
      { facilityId: "kd_petri_jaya", facilityName: "KD Petri Jaya" },
      { facilityId: "kd_plentong", facilityName: "KD Plentong" },
      { facilityId: "kd_pulau_aur", facilityName: "KD Pulau Aur" },
      { facilityId: "kd_pulau_pemanggil", facilityName: "KD Pulau Pemanggil" },
      { facilityId: "kd_pulau_sibu", facilityName: "KD Pulau Sibu" },
      { facilityId: "kd_pulau_tinggi", facilityName: "KD Pulau Tinggi" },
      { facilityId: "kd_punggai", facilityName: "KD Punggai" },
      { facilityId: "kd_sawah_datok", facilityName: "KD Sawah Datok" },
      { facilityId: "kd_semanggar", facilityName: "KD Semanggar" },
      { facilityId: "kd_semenchu", facilityName: "KD Semenchu" },
      { facilityId: "kd_sg_telor", facilityName: "KD Sg Telor" },
      { facilityId: "kd_sri_pantai", facilityName: "KD Sri Pantai" },
      { facilityId: "kd_sungai_ara", facilityName: "KD Sungai Ara" },
      { facilityId: "kd_sungai_sayong", facilityName: "KD Sungai Sayong" },
      { facilityId: "kd_sungai_sibol", facilityName: "KD Sungai Sibol" },
      { facilityId: "kd_sungai_tiram", facilityName: "KD Sungai Tiram" },
      { facilityId: "kd_tanjong_buai", facilityName: "KD Tanjong Buai" },
      { facilityId: "kd_tanjong_langsat", facilityName: "KD Tanjong Langsat" },
      { facilityId: "kd_tanjong_serindit", facilityName: "KD Tanjong Serindit" },
      { facilityId: "kd_telok_sengat", facilityName: "KD Telok Sengat" },
      { facilityId: "kd_teluk_ramunia", facilityName: "KD Teluk Ramunia" },
      { facilityId: "kd_tenggaroh_1_felda", facilityName: "KD Tenggaroh 1 (Felda)" },
      { facilityId: "kd_tenggaroh_5_felda", facilityName: "KD Tenggaroh 5 (Felda)" },
      { facilityId: "kd_tenggaroh_selatan_1", facilityName: "KD Tenggaroh Selatan 1" },
      { facilityId: "kd_tiram_duku", facilityName: "KD Tiram Duku" },
      { facilityId: "kd_triang", facilityName: "KD Triang" },
      { facilityId: "kd_ulu_tebrau", facilityName: "KD Ulu Tebrau" },
    ],
  },
];
