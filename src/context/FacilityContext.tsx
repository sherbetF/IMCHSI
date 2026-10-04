import React, { createContext, useContext, useState, useEffect } from "react";
import { FacilityCategory } from "@/data/facilities";

export interface SelectedFacility {
  category: FacilityCategory | "Hospital Sultan Ismail Admin";
  name: string;
}

export type ModalStep = "greeting" | "facility" | "admin";

interface FacilityContextType {
  selectedFacility: SelectedFacility | null;
  setSelectedFacility: (facility: SelectedFacility | null) => void;
  isAdmin: boolean;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  modalStep: ModalStep;
  setModalStep: (step: ModalStep) => void;
  openModal: (step?: ModalStep, onFacilitySelected?: () => void) => void;
  closeModal: () => void;
  // Outsource Access Protection
  isOutsourceAuthenticated: boolean;
  isOutsourceAuthOpen: boolean;
  openOutsourceAuth: (onSuccessCallback?: () => void) => void;
  closeOutsourceAuth: () => void;
  verifyOutsourcePassword: (password: string) => boolean;
  lockOutsource: () => void;
}

const STORAGE_KEY = "hsi_selected_facility_v1";
const OUTSOURCE_AUTH_KEY = "hsi_outsource_auth_v1";

const FacilityContext = createContext<FacilityContextType | undefined>(undefined);

export const FacilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedFacility, setSelectedFacilityState] = useState<SelectedFacility | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalStep, setModalStep] = useState<ModalStep>("facility");
  const [, setIsMounted] = useState<boolean>(false);
  const [onFacilitySuccessCb, setOnFacilitySuccessCb] = useState<(() => void) | null>(null);
  const [isOutsourceAuthenticated, setIsOutsourceAuthenticated] = useState<boolean>(false);
  const [isOutsourceAuthOpen, setIsOutsourceAuthOpen] = useState<boolean>(false);
  const [onOutsourceSuccessCb, setOnOutsourceSuccessCb] = useState<(() => void) | null>(null);

  useEffect(() => {
    setIsMounted(true);
    // Always start with no facility selected upon opening website fresh
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    try {
      const outsourceAuthSaved = sessionStorage.getItem(OUTSOURCE_AUTH_KEY);
      if (outsourceAuthSaved === "true") {
        setIsOutsourceAuthenticated(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const setSelectedFacility = (facility: SelectedFacility | null) => {
    setSelectedFacilityState(facility);
    if (facility) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(facility));
      } catch {
        // ignore
      }
      setIsModalOpen(false);
      if (onFacilitySuccessCb) {
        onFacilitySuccessCb();
        setOnFacilitySuccessCb(null);
      }
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setIsModalOpen(false);
    }
  };

  const openModal = (step: ModalStep = "facility", onFacilitySelected?: () => void) => {
    setModalStep(step);
    if (onFacilitySelected) {
      setOnFacilitySuccessCb(() => onFacilitySelected);
    } else {
      setOnFacilitySuccessCb(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setOnFacilitySuccessCb(null);
  };

  const openOutsourceAuth = (onSuccessCallback?: () => void) => {
    if (onSuccessCallback) {
      setOnOutsourceSuccessCb(() => onSuccessCallback);
    } else {
      setOnOutsourceSuccessCb(null);
    }
    setIsOutsourceAuthOpen(true);
  };

  const closeOutsourceAuth = () => {
    setIsOutsourceAuthOpen(false);
    setOnOutsourceSuccessCb(null);
  };

  const verifyOutsourcePassword = (password: string): boolean => {
    if (password.trim() === "kipling") {
      setIsOutsourceAuthenticated(true);
      try {
        sessionStorage.setItem(OUTSOURCE_AUTH_KEY, "true");
      } catch {
        // ignore
      }
      setIsOutsourceAuthOpen(false);
      if (onOutsourceSuccessCb) {
        onOutsourceSuccessCb();
        setOnOutsourceSuccessCb(null);
      }
      return true;
    }
    return false;
  };

  const lockOutsource = () => {
    setIsOutsourceAuthenticated(false);
    try {
      sessionStorage.removeItem(OUTSOURCE_AUTH_KEY);
    } catch {
      // ignore
    }
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
        closeModal,
        isOutsourceAuthenticated,
        isOutsourceAuthOpen,
        openOutsourceAuth,
        closeOutsourceAuth,
        verifyOutsourcePassword,
        lockOutsource,
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
  modalStep: "facility",
  setModalStep: () => {},
  openModal: () => {},
  closeModal: () => {},
  isOutsourceAuthenticated: false,
  isOutsourceAuthOpen: false,
  openOutsourceAuth: () => {},
  closeOutsourceAuth: () => {},
  verifyOutsourcePassword: () => false,
  lockOutsource: () => {},
};

export const useFacility = () => {
  const context = useContext(FacilityContext);
  if (!context) {
    return defaultFacilityContext;
  }
  return context;
};
