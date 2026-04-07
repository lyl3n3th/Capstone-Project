export interface MockManagerAccount {
  branch: string;
  fullName: string;
  password: string;
  role: "manager";
}

const mockManagerAccounts: MockManagerAccount[] = [
  {
    branch: "All Branches",
    fullName: "Area Manager",
    password: "manager123",
    role: "manager",
  },
];

export const authenticateManager = (
  password: string,
): MockManagerAccount | null => {
  const account = mockManagerAccounts.find(
    (candidate) => candidate.password === password,
  );

  return account || null;
};
