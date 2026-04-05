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
  {
    branch: "All Branches",
    fullName: "Area Manager",
    password: "manager123",
    role: "manager",
  },
  {
    branch: "Bacoor",
    fullName: "Bacoor Area Manager",
    password: "manager123",
    role: "manager",
  },
  {
    branch: "Taytay",
    fullName: "Taytay Area Manager",
    password: "manager123",
    role: "manager",
  },
  {
    branch: "GMA",
    fullName: "GMA Area Manager",
    password: "manager123",
    role: "manager",
  },
];

export const authenticateStaff = (
  branch: string,
  password: string,
  role: string,
): MockStaffAccount | null => {
  const normalizedBranch = branch.trim();

  const account = mockStaffAccounts.find(
    (account) =>
      account.password === password &&
      account.role === role &&
      (role === "manager"
        ? !normalizedBranch ||
          account.branch === normalizedBranch ||
          account.branch === "All Branches"
        : account.branch === normalizedBranch),
  );
  return account || null;
};
