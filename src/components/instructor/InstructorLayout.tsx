import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { FiEdit3, FiLogOut, FiMenu, FiUpload, FiUsers, FiX } from "react-icons/fi";
import { MdDashboard, MdSettings } from "react-icons/md";
import { useAuth } from "../../hooks/useAuth";
import AccountSettingsModal, {
  type AccountSettingsDraft,
} from "../common/AccountSettingsModal";
import { setInstructorPassword } from "../../services/instructorPortal";
import aicsLogo from "../../assets/images/AICS_Logo.png";
import "../../styles/instructor/instructor.css";

export default function InstructorLayout() {
  const { currentUser, logout, updateCurrentUser } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const menuItems: Array<{ path: string; label: string; icon: ReactNode }> = [
    { path: "/instructor/home", label: "Home", icon: <MdDashboard /> },
    { path: "/instructor/students", label: "Students", icon: <FiUsers /> },
    { path: "/instructor/grades", label: "Grades Upload", icon: <FiUpload /> },
    {
      path: "/instructor/grade-changes",
      label: "Grade Changes",
      icon: <FiEdit3 />,
    },
  ];
  const displayName = currentUser?.displayName || "Instructor";
  const employeeId = currentUser?.employeeId || "Employee ID";
  const branchName = currentUser?.branch?.trim() || "Branch";
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
  const firstName = currentUser?.firstName || nameParts[0] || "Instructor";
  const lastName =
    currentUser?.lastName ||
    (nameParts.length > 1 ? nameParts.slice(1).join(" ") : "");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;

    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isSidebarOpen]);

  const handleUpdateAccount = async ({
    firstName: nextFirstName,
    lastName: nextLastName,
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

      if (newPassword) {
        await setInstructorPassword({
          branch: currentUser?.branch,
          employeeId,
          currentPassword: currentPassword || "",
          password: newPassword,
        });
      }

      const nextDisplayName = `${nextFirstName} ${nextLastName}`.trim();
      updateCurrentUser({
        displayName: nextDisplayName,
        firstName: nextFirstName,
        lastName: nextLastName,
      });
      setShowAccountModal(false);
      setShowProfileMenu(false);
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Failed to update account.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  return (
    <>
      <div className="instructor-shell">
        <button
          type="button"
          className="instructor-menu-toggle"
          onClick={() => setIsSidebarOpen((previousValue) => !previousValue)}
          aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
        >
          {isSidebarOpen ? <FiX /> : <FiMenu />}
        </button>

        <aside className={`instructor-sidebar${isSidebarOpen ? " open" : ""}`}>
          <div className="instructor-sidebar-header">
            <div className="instructor-user-card">
              <div className="instructor-avatar-wrapper" ref={profileMenuRef}>
                <button
                  type="button"
                  className="instructor-avatar-button"
                  onClick={() =>
                    setShowProfileMenu((previousValue) => !previousValue)
                  }
                  aria-label={`${displayName} profile`}
                >
                  <img
                    src={aicsLogo}
                    alt="AICS logo"
                    className="instructor-user-avatar-image"
                  />
                </button>

                {showProfileMenu ? (
                  <div className="instructor-profile-menu">
                    <button
                      type="button"
                      className="instructor-profile-action"
                      onClick={() => {
                        setAccountError("");
                        setShowAccountModal(true);
                        setShowProfileMenu(false);
                      }}
                    >
                      <MdSettings size={18} /> Edit Account
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="instructor-user-info">
                <h3>{displayName}</h3>
                <p className="instructor-user-role">Instructor</p>
                <div className="instructor-branch-name">{branchName} Branch</div>
              </div>
            </div>
          </div>

          <nav className="instructor-sidebar-nav">
            <ul>
              {menuItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `instructor-nav-link${isActive ? " active" : ""}`
                    }
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <span className="instructor-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="instructor-sidebar-footer">
            <button
              type="button"
              className="instructor-logout-btn"
              onClick={() => {
                setIsSidebarOpen(false);
                logout();
              }}
            >
              <FiLogOut />
              <span>Logout</span>
            </button>
          </div>
        </aside>
        <main className="instructor-main">
          <Outlet />
        </main>

        {isSidebarOpen ? (
          <div
            className="instructor-sidebar-overlay"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}
      </div>

      <AccountSettingsModal
        open={showAccountModal}
        title="Account Settings"
        values={{
          firstName,
          lastName,
        }}
        errorMessage={accountError}
        isSaving={isSavingAccount}
        requireCurrentPasswordForPasswordChange
        onClose={() => {
          setAccountError("");
          setShowAccountModal(false);
        }}
        onSave={handleUpdateAccount}
      />
    </>
  );
}
