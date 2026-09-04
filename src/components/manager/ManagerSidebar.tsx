import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  MdBadge,
  MdClose,
  MdDashboard,
  MdEmail,
  MdPeople,
  MdSettings,
} from "react-icons/md";
import { FiLogOut } from "react-icons/fi";
import AccountSettingsModal, {
  type AccountSettingsDraft,
} from "../common/AccountSettingsModal";
import { useAuth } from "../../hooks/useAuth";
import {
  clearManagerAuthentication,
  getStoredManagerAccount,
  updateStoredManagerAccount,
} from "../../services/mockStaffAuth";
import aicsLogo from "../../assets/images/AICS_Logo.png";

interface AreaManagerSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  loggedInUsername: string;
  isMobile?: boolean;
}

interface UserAccount {
  firstName: string;
  lastName: string;
  role: string;
}

interface SidebarMenuItem {
  icon: ReactNode;
  label: string;
  path: string;
}

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
    firstName,
    lastName,
    role: "Area Manager",
  };
};

export default function AreaManagerSidebar({
  isOpen,
  onClose,
  onLogout,
  loggedInUsername,
  isMobile = false,
}: AreaManagerSidebarProps) {
  const { currentUser, updateCurrentUser } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userAccount, setUserAccount] = useState<UserAccount>(() =>
    createFallbackUserAccount(getStoredManagerAccount().fullName || loggedInUsername),
  );
  const [accountError, setAccountError] = useState("");
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserAccount(
      createFallbackUserAccount(
        currentUser?.displayName ||
          getStoredManagerAccount().fullName ||
          loggedInUsername,
      ),
    );

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentUser?.displayName, loggedInUsername]);

  const handleUpdateAccount = async ({
    firstName,
    lastName,
    currentPassword,
    newPassword,
  }: AccountSettingsDraft) => {
    setIsSavingAccount(true);
    setAccountError("");
    try {
      if (newPassword && newPassword.length < 8) {
        setAccountError("Password must be at least 8 characters long.");
        return;
      }

      const nextDisplayName = `${firstName} ${lastName}`.trim();
      await updateStoredManagerAccount({
        fullName: nextDisplayName,
        currentPassword,
        ...(newPassword ? { password: newPassword } : {}),
      });

      setUserAccount((currentAccount) => ({
        ...currentAccount,
        firstName,
        lastName,
      }));
      updateCurrentUser({
        displayName: nextDisplayName,
        firstName,
        lastName,
      });

      setShowEditModal(false);
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Update failed. Please try again.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleLogout = () => {
    clearManagerAuthentication();
    onLogout();
    onClose();
  };

  const displayName =
    `${userAccount.firstName} ${userAccount.lastName}`.trim() ||
    loggedInUsername ||
    "Area Manager";
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
                <img
                  src={aicsLogo}
                  alt="AICS logo"
                  className="area-manager-avatar-image"
                />
              </button>

              {showProfileMenu && (
                <div className="area-manager-profile-menu">
                  <button
                    className="area-manager-profile-action"
                    onClick={() => {
                      setAccountError("");
                      setShowEditModal(true);
                      setShowProfileMenu(false);
                    }}
                    type="button"
                  >
                    <MdSettings size={18} /> Edit Account
                  </button>
                </div>
              )}
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

      <AccountSettingsModal
        open={showEditModal}
        title="Account Settings"
        values={{
          firstName: userAccount.firstName,
          lastName: userAccount.lastName,
        }}
        errorMessage={accountError}
        isSaving={isSavingAccount}
        requireCurrentPasswordForPasswordChange
        onClose={() => {
          setAccountError("");
          setShowEditModal(false);
        }}
        onSave={handleUpdateAccount}
      />
    </>
  );
}
