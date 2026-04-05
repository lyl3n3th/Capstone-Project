import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import axios from "axios";
import {
  MdBadge,
  MdCameraAlt,
  MdClose,
  MdDashboard,
  MdEmail,
  MdPeople,
  MdSettings,
} from "react-icons/md";
import { FiLogOut } from "react-icons/fi";
import { BsEye, BsEyeSlash } from "react-icons/bs";
import { useAuth } from "../../hooks/useAuth";

interface AreaManagerSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  loggedInUsername: string;
  isMobile?: boolean;
}

interface UserAccount {
  id: number | null;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
  profilePic: string;
  newPassword: string;
  confirmPassword: string;
}

interface UserProfileResponse {
  id: number | null;
  first_name: string;
  last_name: string;
  username: string;
  role?: string;
  profile_pic?: string | null;
  new_username?: string;
}

interface ApiErrorResponse {
  error?: string;
}

interface SidebarMenuItem {
  icon: ReactNode;
  label: string;
  path: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const getFallbackNameParts = (displayName: string) => {
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length === 0) {
    return { firstName: "Area", lastName: "Manager" };
  }

  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: "" };
  }

  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(" "),
  };
};

const createFallbackUserAccount = (displayName: string): UserAccount => {
  const { firstName, lastName } = getFallbackNameParts(displayName);

  return {
    id: null,
    firstName,
    lastName,
    username: displayName,
    role: "Area Manager",
    profilePic: "",
    newPassword: "",
    confirmPassword: "",
  };
};

const buildUserProfileUrl = (username: string) =>
  `${API_BASE_URL}/api/user/${encodeURIComponent(username)}/`;

const buildProfileImageUrl = (profilePic: string) =>
  profilePic.startsWith("http") ? profilePic : `${API_BASE_URL}${profilePic}`;

export default function AreaManagerSidebar({
  isOpen,
  onClose,
  onLogout,
  loggedInUsername,
  isMobile = false,
}: AreaManagerSidebarProps) {
  const { currentUser } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [userAccount, setUserAccount] = useState<UserAccount>(() =>
    createFallbackUserAccount(loggedInUsername),
  );
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const oldUsernameRef = useRef(loggedInUsername);

  const fetchProfile = async (targetUsername = oldUsernameRef.current) => {
    try {
      const response = await axios.get<UserProfileResponse>(
        buildUserProfileUrl(targetUsername),
      );

      oldUsernameRef.current = response.data.username;
      setUserAccount((currentAccount) => ({
        ...currentAccount,
        id: response.data.id,
        firstName: response.data.first_name,
        lastName: response.data.last_name,
        username: response.data.username,
        role: response.data.role || "Area Manager",
        profilePic: response.data.profile_pic
          ? buildProfileImageUrl(response.data.profile_pic)
          : "",
      }));
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  };

  useEffect(() => {
    oldUsernameRef.current = loggedInUsername;
    setUserAccount(createFallbackUserAccount(loggedInUsername));
    void fetchProfile(loggedInUsername);

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [loggedInUsername]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setUserAccount((currentAccount) => ({ ...currentAccount, [name]: value }));

    if (errors[name]) {
      setErrors((currentErrors) => ({ ...currentErrors, [name]: false }));
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!event.target.files?.[0]) {
      return;
    }

    const file = event.target.files[0];
    const formData = new FormData();
    formData.append("profile_pic", file);

    if (userAccount.id) {
      formData.append("id", userAccount.id.toString());
    }

    try {
      await axios.post(buildUserProfileUrl(oldUsernameRef.current), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchProfile();
      setShowProfileMenu(false);
    } catch {
      alert("Failed to update profile picture.");
    }
  };

  const handleUpdateAccount = async () => {
    const nextErrors: Record<string, boolean> = {};

    if (!userAccount.firstName.trim()) {
      nextErrors.firstName = true;
    }

    if (!userAccount.lastName.trim()) {
      nextErrors.lastName = true;
    }

    if (!userAccount.username.trim()) {
      nextErrors.username = true;
    }

    if (
      (userAccount.newPassword || userAccount.confirmPassword) &&
      userAccount.newPassword !== userAccount.confirmPassword
    ) {
      nextErrors.confirmPassword = true;
      alert("Passwords do not match!");
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      const formData = new FormData();

      if (userAccount.id) {
        formData.append("id", userAccount.id.toString());
      }

      formData.append("first_name", userAccount.firstName);
      formData.append("last_name", userAccount.lastName);
      formData.append("username", userAccount.username);

      if (userAccount.newPassword) {
        formData.append("password", userAccount.newPassword);
      }

      const response = await axios.post<UserProfileResponse>(
        buildUserProfileUrl(oldUsernameRef.current),
        formData,
      );
      const updatedUsername =
        response.data.new_username || userAccount.username;

      oldUsernameRef.current = updatedUsername;
      setUserAccount((currentAccount) => ({
        ...currentAccount,
        username: updatedUsername,
        newPassword: "",
        confirmPassword: "",
      }));

      alert("Account Updated Successfully!");
      setShowEditModal(false);
      await fetchProfile(updatedUsername);
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? (error.response?.data as ApiErrorResponse | undefined)?.error
        : null;

      alert(errorMessage || "Update failed. Username may be taken.");
    }
  };

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  const displayName =
    `${userAccount.firstName} ${userAccount.lastName}`.trim() ||
    loggedInUsername ||
    "Area Manager";
  const userInitials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((namePart) => namePart[0]?.toUpperCase() || "")
      .join("") || "AM";
  const accessLabel =
    currentUser?.branch?.trim() &&
    currentUser.branch.trim().toLowerCase() !== "all branches"
      ? `${currentUser.branch.trim()} Branch`
      : "All Branches Access";
  const menuItems: SidebarMenuItem[] = [
    {
      icon: <MdDashboard />,
      label: "Dashboard",
      path: "/manager/dashboard",
    },
    {
      icon: <MdEmail />,
      label: "Reports",
      path: "/manager/reports",
    },
    {
      icon: <MdPeople />,
      label: "Students",
      path: "/manager/students",
    },
    {
      icon: <MdBadge />,
      label: "Staff Accounts",
      path: "/manager/staff-accounts",
    },
  ];

  return (
    <>
      <aside className={`area-manager-sidebar ${isOpen ? "open" : ""}`}>
        <div className="area-manager-sidebar-header">
          {isMobile && (
            <button
              className="area-manager-mobile-close"
              onClick={onClose}
              type="button"
            >
              <MdClose size={20} />
            </button>
          )}

          <div className="area-manager-user-card">
            <div className="area-manager-avatar-wrapper" ref={menuRef}>
              <button
                className="area-manager-avatar-button"
                onClick={() =>
                  setShowProfileMenu((currentValue) => !currentValue)
                }
                type="button"
              >
                {userAccount.profilePic ? (
                  <img
                    src={userAccount.profilePic}
                    alt="Profile"
                    className="area-manager-avatar-image"
                  />
                ) : (
                  <span className="area-manager-user-avatar">
                    {userInitials}
                  </span>
                )}
              </button>

              {showProfileMenu && (
                <div className="area-manager-profile-menu">
                  <button
                    className="area-manager-profile-action"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <MdCameraAlt size={18} /> Change Picture
                  </button>
                  <button
                    className="area-manager-profile-action"
                    onClick={() => {
                      setShowEditModal(true);
                      setShowProfileMenu(false);
                    }}
                    type="button"
                  >
                    <MdSettings size={18} /> Edit Account
                  </button>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                hidden
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>

            <div className="area-manager-user-info">
              <h3>{displayName}</h3>
              <p className="area-manager-user-role">{userAccount.role}</p>
            </div>
          </div>
        </div>

        <nav className="area-manager-sidebar-nav">
          <ul>
            {menuItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `area-manager-nav-link${isActive ? " active" : ""}`
                  }
                  onClick={onClose}
                >
                  <span className="area-manager-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="area-manager-sidebar-footer">
          <button
            className="area-manager-logout-btn"
            onClick={handleLogout}
            type="button"
          >
            <FiLogOut />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {showEditModal && (
        <div
          className="area-manager-modal-overlay"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="area-manager-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="area-manager-modal-header">
              <h3>Account Settings</h3>
              <button
                className="area-manager-close-btn"
                onClick={() => setShowEditModal(false)}
                type="button"
              >
                <MdClose size={20} />
              </button>
            </div>
            <div className="area-manager-modal-body">
              <div className="area-manager-form-grid">
                <div className="area-manager-form-group half">
                  <label className="area-manager-label-sm">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    className={`area-manager-form-input ${errors.firstName ? "input-error" : ""}`}
                    value={userAccount.firstName}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="area-manager-form-group half">
                  <label className="area-manager-label-sm">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    className={`area-manager-form-input ${errors.lastName ? "input-error" : ""}`}
                    value={userAccount.lastName}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="area-manager-form-group full">
                  <label className="area-manager-label-sm">Username</label>
                  <input
                    type="text"
                    name="username"
                    className={`area-manager-form-input ${errors.username ? "input-error" : ""}`}
                    value={userAccount.username}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="area-manager-form-group half">
                  <label className="area-manager-label-sm">New Password</label>
                  <div className="area-manager-password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="newPassword"
                      value={userAccount.newPassword}
                      onChange={handleInputChange}
                      className="area-manager-form-input"
                      placeholder="Enter a new password"
                    />
                    <button
                      type="button"
                      className="area-manager-password-toggle-eye"
                      onClick={() =>
                        setShowPassword((currentValue) => !currentValue)
                      }
                    >
                      {showPassword ? (
                        <BsEyeSlash size={18} />
                      ) : (
                        <BsEye size={18} />
                      )}
                    </button>
                  </div>
                </div>
                <div className="area-manager-form-group half">
                  <label className="area-manager-label-sm">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={userAccount.confirmPassword}
                    onChange={handleInputChange}
                    className={`area-manager-form-input ${errors.confirmPassword ? "input-error" : ""}`}
                    placeholder="Confirm your new password"
                  />
                </div>
              </div>
            </div>
            <div className="area-manager-modal-footer">
              <button
                className="area-manager-btn-cancel"
                onClick={() => setShowEditModal(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="area-manager-btn-save"
                onClick={handleUpdateAccount}
                type="button"
              >
                Update Account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
