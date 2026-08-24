import React, { createContext, useContext, useState, useEffect } from "react";
import { FacilityCategory } from "@/data/facilities";

export interface SelectedFacility {
  category: FacilityCategory | "Hospital Sultan Ismail Admin";
  name: string;
}

export type ModalStep = "greeting" | "facility";

interface FacilityContextType {
  selectedFacility: SelectedFacility | null;
  setSelectedFacility: (facility: SelectedFacility | null) => void;
  isAdmin: boolean;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  modalStep: ModalStep;
  setModalStep: (step: ModalStep) => void;
  openModal: (step?: ModalStep) => void;
}

const STORAGE_KEY = "hsi_selected_facility_v1";

const FacilityContext = createContext<FacilityContextType | undefined>(undefined);

export const FacilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedFacility, setSelectedFacilityState] = useState<SelectedFacility | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(true);
  const [modalStep, setModalStep] = useState<ModalStep>("greeting");
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSelectedFacilityState(parsed);
      }
    } catch {
      // ignore
    }
    // Always start with the Greeting popup first when opening the webpage
    setIsModalOpen(true);
    setModalStep("greeting");
  }, []);

  const setSelectedFacility = (facility: SelectedFacility | null) => {
    setSelectedFacilityState(facility);
    if (facility) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(facility));
      } catch {
        // ignore
      }
      setIsModalOpen(false);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setModalStep("facility");
      setIsModalOpen(true);
    }
  };

  const openModal = (step: ModalStep = "facility") => {
    setModalStep(step);
    setIsModalOpen(true);
  };

  const isAdmin =
    selectedFacility?.category === "Hospital Sultan Ismail Admin" ||
    selectedFacility?.name.toLowerCase().includes("admin") ||
    false;

  return (
    <FacilityContext.Provider
      value={{
        selectedFacility,
        setSelectedFacility,
        isAdmin,
        isModalOpen,
        setIsModalOpen,
        modalStep,
        setModalStep,
        openModal,
      }}
    >
      {children}
    </FacilityContext.Provider>
  );
};

const defaultFacilityContext: FacilityContextType = {
  selectedFacility: null,
  setSelectedFacility: () => {},
  isAdmin: false,
  isModalOpen: false,
  setIsModalOpen: () => {},
  modalStep: "greeting",
  setModalStep: () => {},
  openModal: () => {},
};

export const useFacility = () => {
  const context = useContext(FacilityContext);
  if (!context) {
    return defaultFacilityContext;
  }
  return context;
};
