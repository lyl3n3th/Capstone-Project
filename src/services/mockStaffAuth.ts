import { supabase } from "../lib/supabase";

export interface ManagerAccount {
  id?: string;
  branch: string;
  fullName: string;
  role: "manager";
  passwordChangeRequired?: boolean;
}

type ManagerAccountRow = {
  id: string;
  branch: string;
  full_name: string;
  role: "manager";
  password_change_required: boolean;
  session_token?: string;
};

type SupabaseErrorLike = {
  details?: string | null;
  hint?: string | null;
  message: string;
};

const MANAGER_PROFILE_STORAGE_KEY = "aics-manager-profile";
const MANAGER_SESSION_TOKEN_KEY = "aics-manager-session-token";

if (typeof window !== "undefined") {
  localStorage.removeItem("aics-manager-account");
}

const defaultManagerProfile: ManagerAccount = {
  branch: "All Branches",
  fullName: "Area Manager",
  role: "manager",
};

const getErrorMessage = (error: SupabaseErrorLike) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

const getSingleRow = <T,>(data: unknown): T | null => {
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as T) : null;
  }

  return data && typeof data === "object" ? (data as T) : null;
};

const mapManagerAccount = (row: ManagerAccountRow): ManagerAccount => ({
  id: row.id,
  branch: row.branch,
  fullName: row.full_name,
  role: "manager",
  passwordChangeRequired: Boolean(row.password_change_required),
});

const cacheManagerProfile = (account: ManagerAccount) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(MANAGER_PROFILE_STORAGE_KEY, JSON.stringify(account));
  }
};

const getManagerSessionToken = () =>
  typeof window === "undefined"
    ? ""
    : sessionStorage.getItem(MANAGER_SESSION_TOKEN_KEY) || "";

export const getStoredManagerAccount = (): ManagerAccount => {
  if (typeof window === "undefined") {
    return defaultManagerProfile;
  }

  const rawValue = localStorage.getItem(MANAGER_PROFILE_STORAGE_KEY);

  if (!rawValue) {
    return defaultManagerProfile;
  }

  try {
    const profile = JSON.parse(rawValue) as Partial<ManagerAccount>;
    return {
      id: profile.id,
      branch: profile.branch?.trim() || defaultManagerProfile.branch,
      fullName: profile.fullName?.trim() || defaultManagerProfile.fullName,
      role: "manager",
      passwordChangeRequired: Boolean(profile.passwordChangeRequired),
    };
  } catch (error) {
    console.error("Failed to read the cached area manager profile", error);
    return defaultManagerProfile;
  }
};

export const authenticateManager = async (
  password: string,
): Promise<ManagerAccount> => {
  const { data, error } = await supabase
    .rpc("authenticate_area_manager", { p_password: password })
    .returns<ManagerAccountRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<ManagerAccountRow>(data);
  if (!row?.session_token) {
    throw new Error("Unable to create an area manager session.");
  }

  const account = mapManagerAccount(row);
  cacheManagerProfile(account);
  sessionStorage.setItem(MANAGER_SESSION_TOKEN_KEY, row.session_token);
  return account;
};

export const updateStoredManagerAccount = async ({
  fullName,
  currentPassword,
  password,
}: {
  fullName: string;
  currentPassword?: string;
  password?: string;
}): Promise<ManagerAccount> => {
  const sessionToken = getManagerSessionToken();

  if (!sessionToken) {
    throw new Error("Your area manager session has expired. Please sign in again.");
  }

  const { data, error } = await supabase
    .rpc("update_area_manager_account", {
      p_session_token: sessionToken,
      p_full_name: fullName,
      p_current_password: currentPassword || null,
      p_new_password: password || null,
    })
    .returns<ManagerAccountRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<ManagerAccountRow>(data);
  if (!row) {
    throw new Error("Unable to update the area manager account.");
  }

  const account = mapManagerAccount(row);
  cacheManagerProfile(account);
  return account;
};

export const resetStoredManagerPassword = async () => {
  const { error } = await supabase.rpc("reset_area_manager_password");

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  if (typeof window !== "undefined") {
    sessionStorage.removeItem(MANAGER_SESSION_TOKEN_KEY);
  }
};

export const clearManagerAuthentication = () => {
  const sessionToken = getManagerSessionToken();

  if (sessionToken) {
    void supabase.rpc("revoke_area_manager_session", {
      p_session_token: sessionToken,
    });
  }

  if (typeof window !== "undefined") {
    sessionStorage.removeItem(MANAGER_SESSION_TOKEN_KEY);
  }
};
