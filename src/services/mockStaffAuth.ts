// Mock staff data for authentication
export interface MockStaffAccount {
  branch: string;
  fullName: string;
  password: string;
  role: "admin" | "registrar" | "manager";
}

export const mockStaffAccounts: MockStaffAccount[] = [
  {
    branch: "Bacoor",
    fullName: "Liza Mae Guyo",
    password: "admin123",
    role: "admin",
  },
  {
    branch: "Taytay",
    fullName: "Kenneth Lyle Sohot",
    password: "admin123",
    role: "admin",
  },
  {
    branch: "GMA",
    fullName: "Hener Verdida",
    password: "admin123",
    role: "admin",
  },
];

export const authenticateStaff = (
  branch: string,
  password: string,
  role: string,
): MockStaffAccount | null => {
  const account = mockStaffAccounts.find(
    (account) =>
      account.branch === branch &&
      account.password === password &&
      account.role === role,
  );
  return account || null;
};
