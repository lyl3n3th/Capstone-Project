import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BsCardList } from "react-icons/bs";
import { MdDashboard } from "react-icons/md";
import { FaDatabase, FaGraduationCap, FaUserCheck } from "react-icons/fa";
import { FiLogOut } from "react-icons/fi";
import { IoPeopleSharp } from "react-icons/io5";
import {
  MdDeleteOutline,
  MdOutlineAssessment,
  MdSettings,
} from "react-icons/md";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useStoredProfileImage } from "../../hooks/useStoredProfileImage";
import AccountSettingsModal, {
  type AccountSettingsDraft,
} from "../common/AccountSettingsModal";
import {
  fetchStaffMembers,
  updateStaffMember,
  type StaffMember,
} from "../../services/staffApi";
import "../../styles/admin/admin-sidebar.css";

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface AdminMenuItem {
  icon: ReactNode;
  label: string;
  path: string;
  show?: boolean;
}

export default function AdminSidebar({
  isOpen,
  onClose,
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: AdminSidebarProps) {
  const { currentUser, updateCurrentUser } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editableAccount, setEditableAccount] = useState<StaffMember | null>(
    null,
  );
  const [accountError, setAccountError] = useState("");
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { profileImage } = useStoredProfileImage(currentUser);
  const isRegistrarView = loggedInRole === "Registrar";
  const displayName = loggedInUsername.trim() || "Administrator";
  const branchName = currentUser?.branch?.trim() || "Bacoor";
  const userInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((namePart) => namePart[0].toUpperCase())
    .join("");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadEditableAccount = useCallback(async () => {
    if (!currentUser?.employeeId) {
      setEditableAccount(null);
      setAccountError("No staff account is linked to this session.");
      return;
    }

    setIsLoadingAccount(true);
    setAccountError("");

    try {
      const staffMembers = await fetchStaffMembers();
      const matchedAccount = staffMembers.find(
        (member) => member.staff_id === currentUser.employeeId,
      );

      if (!matchedAccount) {
        throw new Error("Unable to load your account settings right now.");
      }

      setEditableAccount(matchedAccount);
    } catch (error) {
      console.error("Failed to load admin account settings", error);
      setEditableAccount(null);
      setAccountError(
        error instanceof Error
          ? error.message
          : "Unable to load your account settings right now.",
      );
    } finally {
      setIsLoadingAccount(false);
    }
  }, [currentUser?.employeeId]);

  useEffect(() => {
    if (!showEditModal) {
      return;
    }

    void loadEditableAccount();
  }, [loadEditableAccount, showEditModal]);

  const menuItems: AdminMenuItem[] = [
    {
      icon: <MdDashboard />,
      label: "Dashboard",
      path: isRegistrarView ? "/registrar/dashboard" : "/admin/dashboard",
    },
    {
      icon: <IoPeopleSharp />,
      label: "Students",
      path: "/admin/students",
    },
    {
      icon: <BsCardList />,
      label: "Grades",
      path: "/admin/grades",
    },
    {
      icon: <FaUserCheck />,
      label: "Enrollees",
      path: "/admin/enrollees",
    },
    {
      icon: <FaGraduationCap />,
      label: "Alumni",
      path: "/admin/alumni",
    },

    {
      icon: <MdOutlineAssessment />,
      label: "Report",
      path: "/admin/reports",
      show: !isRegistrarView,
    },
    {
      icon: <FaDatabase />,
      label: "Backup",
      path: "/admin/backup",
      show: canAccessBackup,
    },
    {
      icon: <MdDeleteOutline />,
      label: "Trash",
      path: "/admin/trash",
    },
  ];

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  const handleUpdateAccount = async ({
    firstName,
    lastName,
    newPassword,
  }: AccountSettingsDraft) => {
    if (!editableAccount) {
      setAccountError("Unable to load your account settings right now.");
      return;
    }

    setIsSavingAccount(true);
    setAccountError("");

    try {
      const updatedAccount = await updateStaffMember(editableAccount.staff_id, {
        ...editableAccount,
        first_name: firstName,
        last_name: lastName,
        password: newPassword,
      });
      const nextDisplayName =
        `${updatedAccount.first_name} ${updatedAccount.last_name}`.trim() ||
        displayName;

      setEditableAccount({
        ...updatedAccount,
        password: "",
      });
      updateCurrentUser({
        displayName: nextDisplayName,
        firstName: updatedAccount.first_name,
        lastName: updatedAccount.last_name,
      });
      setShowEditModal(false);
      setShowProfileMenu(false);
    } catch (error) {
      console.error("Failed to update admin account", error);
      setAccountError(
        error instanceof Error
          ? error.message
          : "Failed to update your account.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  return (
    <>
      <aside className={`admin-sidebar ${isOpen ? "open" : ""}`}>
        <div className="admin-sidebar-header">
          <div className="admin-user-card">
            <div className="admin-avatar-wrapper" ref={profileMenuRef}>
              <button
                type="button"
                className="admin-avatar-button"
                onClick={() =>
                  setShowProfileMenu((previousValue) => !previousValue)
                }
                aria-label={`${displayName} profile`}
              >
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt={`${displayName} profile`}
                    className="admin-user-avatar-image"
                  />
                ) : (
                  <div className="admin-user-avatar">{userInitials}</div>
                )}
              </button>

              {showProfileMenu ? (
                <div className="admin-profile-menu">
                  <button
                    type="button"
                    className="admin-profile-action"
                    onClick={() => {
                      setAccountError("");
                      setIsLoadingAccount(true);
                      setShowEditModal(true);
                      setShowProfileMenu(false);
                    }}
                  >
                    <MdSettings size={18} /> Edit Account
                  </button>
                </div>
              ) : null}
            </div>
            <div className="admin-user-info">
              <h3>{displayName}</h3>
              <p className="admin-user-role">
                {currentUser?.role === "manager"
                  ? "Manager"
                  : loggedInRole === "Registrar"
                  ? "Registrar"
                  : "Branch administrator"}
              </p>
              <div className="admin-branch-name">{branchName} Branch</div>
            </div>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          <ul>
            {menuItems
              .filter((item) => item.show !== false)
              .map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `admin-nav-link${isActive ? " active" : ""}`
                    }
                    onClick={onClose}
                  >
                    <span className="admin-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout}>
            <FiLogOut />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {isOpen && <div className="admin-sidebar-overlay" onClick={onClose} />}

      <AccountSettingsModal
        open={showEditModal}
        title="Account Settings"
        values={
          editableAccount
            ? {
                firstName: editableAccount.first_name,
                lastName: editableAccount.last_name,
              }
            : null
        }
        errorMessage={accountError}
        isLoading={isLoadingAccount}
        isSaving={isSavingAccount}
        onClose={() => {
          setAccountError("");
          setIsLoadingAccount(false);
          setShowEditModal(false);
        }}
        onSave={handleUpdateAccount}
      />
    </>
  );
}
