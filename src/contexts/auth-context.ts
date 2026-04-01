import { createContext } from "react";
import type {
  AppRole,
  AuthSession,
  AuthUser,
  StaffRole,
} from "../types/user";

export interface StudentLoginPayload {
  branch: string;
  studentNumber: string;
  password: string;
}

export interface StaffLoginPayload {
  branch: string;
  fullName: string;
  password: string;
  role: StaffRole;
}

export interface AuthContextType {
  session: AuthSession | null;
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isReady: boolean;
  loginStudent: (payload: StudentLoginPayload) => Promise<AuthUser>;
  loginStaff: (payload: StaffLoginPayload) => Promise<AuthUser>;
  logout: () => void;
  hasAnyRole: (roles: AppRole[]) => boolean;
  getDefaultRouteForRole: (role?: AppRole | null) => string;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);
