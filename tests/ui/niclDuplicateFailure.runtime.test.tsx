/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { vi } from "vitest";
vi.mock("@/lib/firebase", () => ({ db: { _type: "mock-firestore" } }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  getDocs: vi.fn(() => Promise.reject(new Error("Simulated Firestore duplicate-check failure"))),
}));
vi.mock("@/services/firebaseAppointments", () => ({
  subscribeToAppointments: vi.fn((_procedure, _facilityId, _canManage, callback) => { callback([], "connected"); return () => {}; }),
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
}));
vi.mock("@/context/FacilityContext", () => ({
  useFacility: vi.fn(() => ({
    selectedFacility: { facilityId: "test_facility", name: "Synthetic Test Facility" },
    facilityId: "test_facility",
    isAdmin: false,
    canManageScheduling: false,
    setSelectedFacility: vi.fn(),
    setIsModalOpen: vi.fn(),
  })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/hospital/EchoFormModal", () => ({ EchoFormModal: () => null }));
import { EchoAppointment } from "@/components/hospital/EchoAppointment";
describe("Echo appointment runtime", () => {
  it("renders the request form for a synthetic facility", () => {
    render(createElement(EchoAppointment));
    expect(screen.getByRole("button", { name: "Submit Appointment Request" })).toBeTruthy();
  });
});
import { toast } from "sonner";
import { getDocs } from "firebase/firestore";
import { createAppointment } from "@/services/firebaseAppointments";
describe("Echo duplicate-check failure protection", () => {
  it("blocks submission when duplicate checking fails", async () => {
    vi.clearAllMocks();
    vi.mocked(getDocs).mockRejectedValue(new Error("Simulated duplicate-check failure"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(createElement(EchoAppointment));
      const fields = [
        ["e.g. Patient Full Name", "Synthetic Patient"],
        ["e.g. 880512015541 or ID884920", "TEST123456"],
        ["e.g. +60 12-345 6789", "0123456789"],
        ["e.g. Dr. Tan Ai Ling", "Test Doctor"],
        ["e.g. Outpatient Department", "Test Department"],
        ["Describe patient's symptoms, cardiovascular risks, murmur, prior ECG findings...", "Synthetic clinical indication"],
        ["Provide primary working diagnosis (e.g. Hypertensive Heart Disease, Aortic Stenosis, Heart Failure).", "Synthetic diagnosis"],
      ];
      for (const [placeholder, value] of fields) fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Submit Appointment Request" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Unable to check existing appointments. Please try again."));
      expect(getDocs).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Important Requirement Notice")).toBeNull();
      expect(createAppointment).not.toHaveBeenCalled();
    } finally { errorSpy.mockRestore(); }
  });
});
describe("NICL duplicate-check runtime setup", () => {
  it("provides a browser-like test environment", () => {
    render(createElement("button", null, "Test Button"));
    expect(screen.getByRole("button", { name: "Test Button" })).toBeTruthy();
  });
});
