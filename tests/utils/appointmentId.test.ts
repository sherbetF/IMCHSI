import { describe, expect, it } from "vitest";
import {
  generateAppointmentId,
  formatAppointmentCode,
  getFacilityCode,
} from "@/utils/appointmentId";

describe("Appointment ID Utility (AAAA-BBBB-CCCC format)", () => {
  it("derives correct facility codes for various facilities", () => {
    expect(getFacilityCode("Hospital Kota Tinggi", "hospital_kota_tinggi")).toBe("HKT");
    expect(getFacilityCode("Hospital Pasir Gudang", "hospital_pasir_gudang")).toBe("HPG");
    expect(getFacilityCode("Hospital Mersing", "hospital_mersing")).toBe("HMS");
    expect(getFacilityCode("Hospital Sultan Ismail", "hsi_admin")).toBe("HSI");
    expect(getFacilityCode("KK Pasir Gudang", "kk_pasir_gudang")).toBe("KKPG");
    expect(getFacilityCode("KK Masai", "kk_masai")).toBe("KKM");
    expect(getFacilityCode("KPJ Bandar Dato Onn", "kpj")).toBe("KPJ");
  });

  it("generates new appointment IDs following AAAA-BBBB-CCCC", () => {
    const estId = generateAppointmentId("EST", "Hospital Kota Tinggi", "hospital_kota_tinggi");
    expect(estId).toMatch(/^EST-HKT-\d{4}$/);

    const holterId = generateAppointmentId("HOLTER", "KK Pasir Gudang", "kk_pasir_gudang");
    expect(holterId).toMatch(/^HOLTER-KKPG-\d{4}$/);

    const echoId = generateAppointmentId("ECHO", "Hospital Pasir Gudang", "hospital_pasir_gudang");
    expect(echoId).toMatch(/^ECHO-HPG-\d{4}$/);
  });

  it("converts previous/legacy appointment codes (e.g. EST-2026-3716) to AAAA-BBBB-CCCC", () => {
    // Stress test legacy format
    const formattedEst = formatAppointmentCode(
      "EST-2026-3716",
      "Exercise Stress Test",
      "Hospital Kota Tinggi",
      "hospital_kota_tinggi",
    );
    expect(formattedEst).toBe("EST-HKT-3716");

    // Holter legacy format
    const formattedHolter = formatAppointmentCode(
      "HOLTER-2026-1042",
      "24 Hours Holter Monitoring",
      "KK Pasir Gudang",
      "kk_pasir_gudang",
    );
    expect(formattedHolter).toBe("HOLTER-KKPG-1042");

    // Echo legacy format
    const formattedEcho = formatAppointmentCode(
      "ECHO-2026-8291",
      "Transthoracic Echocardiogram (TTE)",
      "Hospital Pasir Gudang",
      "hospital_pasir_gudang",
    );
    expect(formattedEcho).toBe("ECHO-HPG-8291");

    // Outsource legacy format
    const formattedOut = formatAppointmentCode(
      "OUT-2026-5532",
      "Computed Tomography Scan ( CT SCAN )",
      "KPJ",
      "kpj",
    );
    expect(formattedOut).toBe("OUT-KPJ-5532");
  });

  it("preserves IDs that are already formatted with facility codes", () => {
    expect(formatAppointmentCode("EST-HKT-3716")).toBe("EST-HKT-3716");
    expect(formatAppointmentCode("HOLTER-KKPG-1042")).toBe("HOLTER-KKPG-1042");
    expect(formatAppointmentCode("ECHO-HPG-8291")).toBe("ECHO-HPG-8291");
  });

  it("handles empty or falsy rawId gracefully", () => {
    expect(formatAppointmentCode("")).toBe("");
    expect(formatAppointmentCode(null)).toBe("");
    expect(formatAppointmentCode(undefined)).toBe("");
  });
});
