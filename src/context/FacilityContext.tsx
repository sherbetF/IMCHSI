import React, { createContext, useContext, useState, useEffect } from "react";
import { FacilityCategory } from "@/data/facilities";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export interface SelectedFacility {
  facilityId: string;
  category: FacilityCategory | "Hospital Sultan Ismail Admin";
  name: string;
}

export type ModalStep = "greeting" | "facility" | "admin";

export type UserRole = "admin" | "facility" | "paramedic_nurse" | "doctor" | "outsource";

export const OUTSOURCE_AUTH_EMAIL = "outsource@auth.local";

export function getFacilityAuthEmail(facilityId: string): string {
  return `facility_${facilityId.toLowerCase()}@auth.local`;
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
  // Outsource Access Protection (Server-Authoritative)
  isOutsourceAuthenticated: boolean;
  isOutsourceAuthOpen: boolean;
  openOutsourceAuth: (onSuccessCallback?: () => void) => void;
  closeOutsourceAuth: () => void;
  loginOutsource: (password: string) => Promise<{ success: boolean; error?: string }>;
  logoutOutsource: () => Promise<void>;
  // Firebase Auth variables
  currentUser: User | null;
  userRole: UserRole | null;
  isParamedicNurse: boolean;
  isDoctor: boolean;
  canManageScheduling: boolean;
  facilityId: string | null;
  mustChangePassword: boolean;
  refreshUserProfile: () => Promise<boolean>;
}

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
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  const refreshUserProfile = async (): Promise<boolean> => {
    if (!auth.currentUser) {
      setMustChangePassword(false);
      return false;
    }
    try {
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const forceChange = userData.mustChangePassword === true;
        setMustChangePassword(forceChange);
        return !forceChange;
      }
    } catch (err) {
      console.error("Failed to refresh user profile from Firestore:", err);
    }
    return false;
  };

  useEffect(() => {
    setIsMounted(true);

    // Enforce Firebase Auth session-only persistence (browserSessionPersistence)
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.warn("Could not set browserSessionPersistence in FacilityContext:", err);
    });

    // Set up Firebase Auth state listener (Single Source of Truth)
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (!userDocSnap.exists()) {
            // FAIL CLOSED: Account exists in Firebase Auth but has no trusted authorization profile
            await signOut(auth);
            setCurrentUser(null);
            setUserRole(null);
            setFacilityId(null);
            setSelectedFacilityState(null);
            setIsOutsourceAuthenticated(false);
            return;
          }

          const userData = userDocSnap.data();
          if (userData.active !== true) {
            // FAIL CLOSED: Account is disabled
            await signOut(auth);
            setCurrentUser(null);
            setUserRole(null);
            setFacilityId(null);
            setSelectedFacilityState(null);
            setIsOutsourceAuthenticated(false);
            return;
          }

          if (userData.role === "admin") {
            setCurrentUser(user);
            setUserRole("admin");
            setFacilityId(null);
            setMustChangePassword(false);
            setSelectedFacilityState({
              facilityId: "admin",
              category: "Hospital Sultan Ismail Admin",
              name: "Hospital Sultan Ismail (Admin Mode)",
            });
            setIsOutsourceAuthenticated(true);
          } else if (userData.role === "facility") {
            if (!userData.facilityId || typeof userData.facilityId !== "string") {
              // FAIL CLOSED: Missing or invalid canonical facilityId
              await signOut(auth);
              setCurrentUser(null);
              setUserRole(null);
              setFacilityId(null);
              setMustChangePassword(false);
              setSelectedFacilityState(null);
              setIsOutsourceAuthenticated(false);
              return;
            }
            setCurrentUser(user);
            setUserRole("facility");
            setFacilityId(userData.facilityId);
            // Backward compatibility: If mustChangePassword is missing/undefined, treat as false.
            setMustChangePassword(userData.mustChangePassword === true);
            setSelectedFacilityState({
              facilityId: userData.facilityId,
              category: userData.category || "Klinik Kesihatan",
              name: userData.facilityName || userData.facilityId,
            });
            setIsOutsourceAuthenticated(false);
          } else if (userData.role === "paramedic_nurse") {
            setCurrentUser(user);
            setUserRole("paramedic_nurse");
            setFacilityId(null);
            setMustChangePassword(false);
            setSelectedFacilityState({
              facilityId: "paramedic_nurse",
              category: "Hospital",
              name: userData.displayName || "Paramedic / Nurse",
            });
            setIsOutsourceAuthenticated(false);
          } else if (userData.role === "doctor") {
            if (
              !userData.doctorId ||
              typeof userData.doctorId !== "string" ||
              !userData.doctorId.trim() ||
              userData.active !== true
            ) {
              await signOut(auth);
              setCurrentUser(null);
              setUserRole(null);
              setFacilityId(null);
              setMustChangePassword(false);
              setSelectedFacilityState(null);
              setIsOutsourceAuthenticated(false);
              return;
            }
            setCurrentUser(user);
            setUserRole("doctor");
            setFacilityId(null);
            setMustChangePassword(false);
            setSelectedFacilityState({
              facilityId: userData.doctorId,
              category: "Hospital",
              name: userData.displayName || "Rheumatology Doctor",
            });
            setIsOutsourceAuthenticated(false);
          } else if (userData.role === "outsource") {
            setCurrentUser(user);
            setUserRole("outsource");
            setFacilityId("outsource");
            setMustChangePassword(false);
            setSelectedFacilityState({
              facilityId: "outsource",
              category: "Hospital",
              name: "Outsource Radiology & Diagnostic Services",
            });
            setIsOutsourceAuthenticated(true);
          } else {
            // FAIL CLOSED: Unknown role
            await signOut(auth);
            setCurrentUser(null);
            setUserRole(null);
            setFacilityId(null);
            setMustChangePassword(false);
            setSelectedFacilityState(null);
            setIsOutsourceAuthenticated(false);
          }
        } catch (error) {
          console.error("Error verifying user profile on auth change:", error);
          await signOut(auth).catch(() => {});
          setCurrentUser(null);
          setUserRole(null);
          setFacilityId(null);
          setMustChangePassword(false);
          setSelectedFacilityState(null);
          setIsOutsourceAuthenticated(false);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setFacilityId(null);
        setMustChangePassword(false);
        setSelectedFacilityState(null);
        setIsOutsourceAuthenticated(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const setSelectedFacility = async (facility: SelectedFacility | null) => {
    if (!facility) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Sign out failed:", err);
      }
      setSelectedFacilityState(null);
      setIsModalOpen(false);
      setIsOutsourceAuthenticated(false);
    } else {
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

  const loginOutsource = async (
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await setPersistence(auth, browserSessionPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, OUTSOURCE_AUTH_EMAIL, password);
      const user = userCredential.user;

      // Validate the user's trusted profile in users/{uid}
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await signOut(auth);
        return {
          success: false,
          error: "Invalid outsource credentials or account not provisioned.",
        };
      }

      const userData = userDocSnap.data();
      if (userData.role !== "outsource" || userData.active !== true) {
        await signOut(auth);
        return {
          success: false,
          error: "Unauthorized access: Account is not an active outsource account.",
        };
      }

      setUserRole("outsource");
      setIsOutsourceAuthenticated(true);
      setSelectedFacilityState({
        facilityId: "outsource",
        category: "Hospital",
        name: "Outsource Radiology & Diagnostic Services",
      });
      setIsOutsourceAuthOpen(false);
      if (onOutsourceSuccessCb) {
        onOutsourceSuccessCb();
        setOnOutsourceSuccessCb(null);
      }
      return { success: true };
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      console.error("Outsource authentication error:", authErr.code);
      let errorMsg = "Invalid outsource credentials or account not provisioned.";
      if (authErr.code === "auth/user-not-found" || authErr.code === "auth/invalid-credential") {
        errorMsg =
          "Outsource account not provisioned in Firebase Auth. Please run `node scripts/provision-outsource.js` in your backend environment.";
      }
      return {
        success: false,
        error: errorMsg,
      };
    }
  };

  const logoutOutsource = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Outsource sign out failed:", err);
    }
    setIsOutsourceAuthenticated(false);
    setUserRole(null);
    setCurrentUser(null);
    setSelectedFacilityState(null);
  };

  const isAdmin = userRole === "admin" && currentUser !== null;
  const isParamedicNurse = userRole === "paramedic_nurse" && currentUser !== null;
  const isDoctor = userRole === "doctor" && currentUser !== null;
  const canManageScheduling = isAdmin || isParamedicNurse;

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
        loginOutsource,
        logoutOutsource,
        currentUser,
        userRole,
        isParamedicNurse,
        isDoctor,
        canManageScheduling,
        facilityId,
        mustChangePassword,
        refreshUserProfile,
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
  isParamedicNurse: false,
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
  loginOutsource: async () => ({ success: false }),
  logoutOutsource: async () => {},
  currentUser: null,
  userRole: null,
  isParamedicNurse: false,
  isDoctor: false,
  facilityId: null,
  canManageScheduling: false,
  mustChangePassword: false,
  refreshUserProfile: async () => false,
};

export const useFacility = () => {
  const context = useContext(FacilityContext);
  if (!context) {
    return defaultFacilityContext;
  }
  return context;
};
