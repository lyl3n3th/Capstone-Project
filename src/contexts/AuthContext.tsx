import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AUTH_STORAGE_KEY,
  DEFAULT_ROUTE_BY_ROLE,
  STAFF_ROLE_LABELS,
  type AppRole,
  type AuthSession,
  type AuthUser,
} from "../types/user";
import {
  AuthContext,
  type AuthContextType,
  type StaffLoginPayload,
  type StudentLoginPayload,
} from "./auth-context";

const formatDisplayName = (value: string) =>
  value
    .trim()
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isReady, setIsReady] = useState(false);

  const persistSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);

    if (typeof window === "undefined") {
      return;
    }

    if (!nextSession) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsReady(true);
      return;
    }

    const storedSession = localStorage.getItem(AUTH_STORAGE_KEY);

    if (!storedSession) {
      setIsReady(true);
      return;
    }

    try {
      const parsedSession = JSON.parse(storedSession) as AuthSession;
      setSession(parsedSession);
    } catch (error) {
      console.error("Failed to restore authentication session", error);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } finally {
      setIsReady(true);
    }
  }, []);

  const loginStudent = useCallback(
    async ({ branch, studentNumber }: StudentLoginPayload) => {
      const normalizedStudentNumber = studentNumber.trim();
      const user: AuthUser = {
        id: `student-${normalizedStudentNumber}`,
        role: "student",
        displayName: `Student ${normalizedStudentNumber}`,
        branch: branch.trim(),
        studentNumber: normalizedStudentNumber,
      };
      const nextSession: AuthSession = {
        user,
        authenticatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
      return user;
    },
    [persistSession],
  );

  const loginStaff = useCallback(
    async ({ branch, fullName, role }: StaffLoginPayload) => {
      const normalizedFullName = fullName.trim();
      const displayName = normalizedFullName || STAFF_ROLE_LABELS[role];
      const user: AuthUser = {
        id: `${role}-${normalizedFullName.toLowerCase()}`,
        role,
        displayName,
        branch: branch.trim(),
        username: normalizedFullName,
      };
      const nextSession: AuthSession = {
        user,
        authenticatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
      return user;
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  const hasAnyRole = useCallback(
    (roles: AppRole[]) => {
      if (!session?.user) {
        return false;
      }

      return roles.includes(session.user.role);
    },
    [session],
  );

  const getDefaultRouteForRole = useCallback((role?: AppRole | null) => {
    if (!role) {
      return "/";
    }

    return DEFAULT_ROUTE_BY_ROLE[role] ?? "/";
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      currentUser: session?.user ?? null,
      isAuthenticated: Boolean(session?.user),
      isReady,
      loginStudent,
      loginStaff,
      logout,
      hasAnyRole,
      getDefaultRouteForRole,
    }),
    [
      getDefaultRouteForRole,
      hasAnyRole,
      isReady,
      loginStaff,
      loginStudent,
      logout,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
