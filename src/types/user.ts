export const AUTH_STORAGE_KEY = "aics-auth-session";

export type AppRole = "student" | "admin" | "registrar" | "manager";
export type StaffRole = Exclude<AppRole, "student">;

export interface AuthUser {
  id: string;
  role: AppRole;
  displayName: string;
  branch: string;
  studentNumber?: string;
  username?: string;
}

export interface AuthSession {
  user: AuthUser;
  authenticatedAt: string;
}

export const DEFAULT_ROUTE_BY_ROLE: Record<AppRole, string> = {
  student: "/student/home",
  admin: "/admin/dashboard",
  registrar: "/admin/dashboard",
  manager: "/admin/dashboard",
};

export const STAFF_PORTAL_ROLES: StaffRole[] = [
  "admin",
  "registrar",
  "manager",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrator",
  registrar: "Registrar",
  manager: "Manager",
};

export const getLoginRouteForRoles = (roles: AppRole[]) => {
  const studentOnlyRoute =
    roles.length === 1 && roles.every((role) => role === "student");

  return studentOnlyRoute ? "/student/login" : "/staff/login";
};
