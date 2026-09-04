export const AUTH_STORAGE_KEY = "aics-auth-session";

export type AppRole = "student" | "admin" | "registrar" | "manager" | "instructor";
export type StaffRole = Exclude<AppRole, "student">;

export interface AuthUser {
  id: string;
  role: AppRole;
  displayName: string;
  branch: string;
  studentNumber?: string;
  employeeId?: string;
  username?: string;
  trackingNumber?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
  contactNumber?: string;
  address?: string;
  program?: string;
  yearLevel?: string;
  section?: string;
  programType?: "SHS" | "BS" | "Short Course";
  gender?: "Male" | "Female";
  civilStatus?: string;
  birthDate?: string;
}

export interface AuthSession {
  user: AuthUser;
  authenticatedAt: string;
}

export const DEFAULT_ROUTE_BY_ROLE: Record<AppRole, string> = {
  student: "/student/home",
  admin: "/admin/dashboard",
  registrar: "/registrar/dashboard",
  manager: "/manager/dashboard",
  instructor: "/instructor/home",
};

export const STAFF_PORTAL_ROLES: StaffRole[] = [
  "admin",
  "registrar",
  "manager",
  "instructor",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrator",
  registrar: "Registrar",
  manager: "Area Manager",
  instructor: "Instructor",
};

export const getLoginRouteForRoles = (roles: AppRole[]) => {
  const studentOnlyRoute =
    roles.length === 1 && roles.every((role) => role === "student");

  return studentOnlyRoute ? "/student/login" : "/staff/login";
};
