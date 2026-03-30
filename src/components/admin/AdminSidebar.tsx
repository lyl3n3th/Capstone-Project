import type { ReactNode } from "react";
import { BsCardList } from "react-icons/bs";
import { MdDashboard } from "react-icons/md";
import {
  FaDatabase,
  FaGraduationCap,
  FaUserCheck,
} from "react-icons/fa";
import { FiLogOut } from "react-icons/fi";
import { IoPeopleSharp } from "react-icons/io5";
import { MdDeleteOutline, MdOutlineAssessment } from "react-icons/md";
import { NavLink } from "react-router-dom";
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
  const displayName = loggedInUsername.trim() || "Administrator";
  const userInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((namePart) => namePart[0].toUpperCase())
    .join("");

  const menuItems: AdminMenuItem[] = [
    {
      icon: <MdDashboard />,
      label: "Dashboard",
      path: "/admin/dashboard",
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
      path: "/admin/report",
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
      path: "/admin/archive",
    },
  ];

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  return (
    <>
      <aside className={`admin-sidebar ${isOpen ? "open" : ""}`}>
        <div className="admin-sidebar-header">
          <div className="admin-user-card">
            <div className="admin-user-avatar">{userInitials}</div>
            <div className="admin-user-info">
              <h3>{displayName}</h3>
              <p className="admin-user-role">
                {loggedInRole === "Registrar"
                  ? "Registrar"
                  : "Branch administrator"}
              </p>
              <div className="admin-branch-name">Bacoor Branch</div>
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
    </>
  );
}
