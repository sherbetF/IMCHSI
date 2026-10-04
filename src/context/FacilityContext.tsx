import React, { createContext, useContext, useState, useEffect } from "react";
import { FacilityCategory } from "@/data/facilities";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export interface SelectedFacility {
  category: FacilityCategory | "Hospital Sultan Ismail Admin";
  name: string;
}

export type ModalStep = "greeting" | "facility" | "admin";

export function getFacilityId(facilityName: string): string {
  return facilityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getFacilityAuthEmail(facilityId: string, resetCount: number = 0) {
  const prefix = resetCount > 0 ? `_r${resetCount}` : "";
  return `facility_${facilityId.toLowerCase()}${prefix}@auth.local`;
}

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
  // Firebase Auth variables
  currentUser: User | null;
  userRole: "admin" | "facility" | null;
  facilityId: string | null;
}

const OUTSOURCE_AUTH_KEY = "hsi_outsource_auth_v1";
export const ACTIVE_SESSION_TOKEN_KEY = "hsi_active_session_token";

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

  // Firebase Auth states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "facility" | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);

    // Enforce session persistence so closing website/tab automatically logs out facility users and admins
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.warn("Could not set browserSessionPersistence:", err);
    });

    try {
      const outsourceAuthSaved = sessionStorage.getItem(OUTSOURCE_AUTH_KEY);
      if (outsourceAuthSaved === "true") {
        setIsOutsourceAuthenticated(true);
      }
    } catch {
      // ignore
    }

    // Set up Firebase Auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Verify active tab session token. If the tab was closed and reopened, sessionStorage will be empty
        let activeToken = null;
        try {
          activeToken = sessionStorage.getItem(ACTIVE_SESSION_TOKEN_KEY);
        } catch {
          // ignore
        }

        if (!activeToken) {
          // Tab/browser was closed or opened without an active login in this tab
          try {
            await signOut(auth);
          } catch (err) {
            console.warn("Sign out on missing session token error:", err);
          }
          setCurrentUser(null);
          setUserRole(null);
          setFacilityId(null);
          setSelectedFacilityState(null);
          return;
        }

        setCurrentUser(user);
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            if (userData.active === true) {
              setUserRole(userData.role);
              if (userData.role === "admin") {
                setFacilityId(null);
                setSelectedFacilityState({
                  category: "Hospital Sultan Ismail Admin",
                  name: "Hospital Sultan Ismail (Admin Mode)",
                });
              } else if (userData.role === "facility") {
                setFacilityId(userData.facilityId);
                setSelectedFacilityState({
                  category: userData.category || "Klinik Kesihatan",
                  name: userData.facilityName,
                });
              }
            } else {
              sessionStorage.removeItem(ACTIVE_SESSION_TOKEN_KEY);
              await signOut(auth);
            }
          } else {
            // Document does not exist yet (e.g. during registration)
            console.log("User profile document not found yet.");
          }
        } catch (error) {
          console.error("Error loading user profile on auth change:", error);
        }
      } else {
        try {
          sessionStorage.removeItem(ACTIVE_SESSION_TOKEN_KEY);
        } catch {
          // ignore
        }
        setCurrentUser(null);
        setUserRole(null);
        setFacilityId(null);
        setSelectedFacilityState(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const setSelectedFacility = async (facility: SelectedFacility | null) => {
    if (!facility) {
      try {
        sessionStorage.removeItem(ACTIVE_SESSION_TOKEN_KEY);
      } catch {
        // ignore
      }
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Sign out failed:", err);
      }
      setSelectedFacilityState(null);
      setIsModalOpen(false);
    } else {
      if (auth.currentUser) {
        try {
          sessionStorage.setItem(ACTIVE_SESSION_TOKEN_KEY, auth.currentUser.uid);
        } catch {
          // ignore
        }
      }
      setSelectedFacilityState(facility);
      setIsModalOpen(false);
      if (onFacilitySuccessCb) {
        onFacilitySuccessCb();
        setOnFacilitySuccessCb(null);
      }
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
    userRole === "admin" || selectedFacility?.category === "Hospital Sultan Ismail Admin";

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
        currentUser,
        userRole,
        facilityId,
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
  currentUser: null,
  userRole: null,
  facilityId: null,
};

export const useFacility = () => {
  const context = useContext(FacilityContext);
  if (!context) {
    return defaultFacilityContext;
  }
  return context;
};
