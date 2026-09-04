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
import {
  loginStudentPortal,
  loginStudentPortalWithEmail,
  mapStudentIdentityToAuthUser,
  startStudentGoogleLogin,
} from "../services/auth";
import { supabase } from "../lib/supabase";

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

  const createStudentSessionFromEmail = useCallback(
    async (email: string) => {
      const identity = await loginStudentPortalWithEmail({ email });
      const user: AuthUser = mapStudentIdentityToAuthUser(identity);
      const nextSession: AuthSession = {
        user,
        authenticatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
      return user;
    },
    [persistSession],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsReady(true);
      return;
    }

    const storedSession = localStorage.getItem(AUTH_STORAGE_KEY);

    if (!storedSession) {
      void supabase.auth
        .getSession()
        .then(async ({ data }) => {
          const email = data.session?.user.email;

          if (!email) {
            return;
          }

          await createStudentSessionFromEmail(email);
          await supabase.auth.signOut();
        })
        .catch(async (error) => {
          console.error("Failed to restore Google student session", error);
          localStorage.removeItem(AUTH_STORAGE_KEY);
          sessionStorage.setItem(
            "student-google-login-error",
            error instanceof Error
              ? error.message
              : "Unable to sign in with that Google account.",
          );
          await supabase.auth.signOut();
        })
        .finally(() => setIsReady(true));
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
  }, [createStudentSessionFromEmail]);

  const loginStudent = useCallback(
    async ({ studentNumber, password }: StudentLoginPayload) => {
      const identity = await loginStudentPortal({
        studentNumber,
        password,
      });
      const user: AuthUser = mapStudentIdentityToAuthUser(identity);
      const nextSession: AuthSession = {
        user,
        authenticatedAt: new Date().toISOString(),
      };

      persistSession(nextSession);
      return user;
    },
    [persistSession],
  );

  const loginStudentWithEmail = useCallback(
    async ({ email }: { email: string }) => {
      return createStudentSessionFromEmail(email);
    },
    [createStudentSessionFromEmail],
  );

  const loginStudentWithGoogle = useCallback(
    async () => {
      await startStudentGoogleLogin();
    },
    [],
  );

  const loginStaff = useCallback(
    async ({ id, branch, fullName, employeeId, role }: StaffLoginPayload) => {
      const normalizedFullName = fullName.trim();
      const displayName = normalizedFullName || STAFF_ROLE_LABELS[role];
      const normalizedEmployeeId = employeeId.trim().toUpperCase();
      const user: AuthUser = {
        id:
          id?.trim() ||
          normalizedEmployeeId ||
          `${role}-${normalizedFullName.toLowerCase()}`,
        role,
        displayName,
        branch: branch.trim(),
        employeeId: normalizedEmployeeId,
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

  const updateCurrentUser = useCallback((updates: Partial<AuthUser>) => {
    setSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      const nextSession: AuthSession = {
        ...currentSession,
        user: {
          ...currentSession.user,
          ...updates,
        },
      };

      if (typeof window !== "undefined") {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
      }

      return nextSession;
    });
  }, []);

  const logout = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  useEffect(() => {
    if (typeof window === "undefined" || !isReady) {
      return;
    }

    const logoutStaffWhenOffline = () => {
      setSession((currentSession) => {
        if (
          currentSession?.user &&
          currentSession.user.role !== "student" &&
          !window.navigator.onLine
        ) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          return null;
        }

        return currentSession;
      });
    };

    logoutStaffWhenOffline();
    window.addEventListener("offline", logoutStaffWhenOffline);

    return () => {
      window.removeEventListener("offline", logoutStaffWhenOffline);
    };
  }, [isReady]);

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
      loginStudentWithEmail,
      loginStudentWithGoogle,
      loginStaff,
      updateCurrentUser,
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
      loginStudentWithEmail,
      loginStudentWithGoogle,
      logout,
      updateCurrentUser,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
