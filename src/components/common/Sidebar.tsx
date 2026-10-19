import { FaHome, FaGraduationCap } from "react-icons/fa";
import { IoPersonSharp } from "react-icons/io5";
import { BsCardList } from "react-icons/bs";
import { IoBookSharp } from "react-icons/io5";
import { MdOutlineNoteAlt } from "react-icons/md";
import { FiLogOut } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useEffect } from "react";
import aicsLogo from "../../assets/images/AICS_Logo.png";

import "../../styles/components/sidebar.css";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activePage?: string;
  onLogout?: () => void;
}

function Sidebar({
  isOpen,
  onClose,
  activePage = "home",
  onLogout,
}: SidebarProps) {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const studentName = [currentUser?.firstName, currentUser?.lastName]
    .map((name) => name?.trim())
    .filter(Boolean)
    .join(" ") || "Student";

  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (window.innerWidth >= 1024) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const originalOverflow = document.body.style.overflow;
    if (window.innerWidth < 1024) document.body.style.overflow = "hidden";

    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const menuItems = [
    {
      id: "home",
      icon: <FaHome />,
      label: "Home",
      path: "/student/home",
    },
    {
      id: "profile",
      icon: <IoPersonSharp />,
      label: "Profile",
      path: "/student/profile",
    },
    {
      id: "grades",
      icon: <BsCardList />,
      label: "Grades",
      path: "/student/grades",
    },
    {
      id: "subjects",
      icon: <IoBookSharp />,
      label: "Current Subjects",
      path: "/student/subjects",
    },
    {
      id: "enrollment",
      icon: <FaGraduationCap />,
      label: "Enrollment",
      path: "/student/enrollment",
    },
    {
      id: "evaluation",
      icon: <MdOutlineNoteAlt />,
      label: "Evaluation",
      path: "/student/evaluation",
    },
  ];

  const handleItemClick = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogoutClick = () => {
    logout();

    if (onLogout) {
      onLogout();
    }

    navigate("/student/login");
    onClose();
  };

  return (
    <aside id="student-sidebar" aria-label="Student portal" className={`s-sidebar ${isOpen ? "s-open" : ""}`}>
      <div className="s-sidebar-header">
        <div className="s-sidebar-user-card">
          <img src={aicsLogo} alt="AICS logo" className="s-sidebar-logo" />
          <div className="s-sidebar-user-info">
            <h3>{studentName}</h3>
            <p className="s-sidebar-user-role">Student</p>
            <div className="s-branch-name">
              {currentUser?.branch || "Bacoor"} Branch
            </div>
          </div>
        </div>
      </div>

      <nav className="s-sidebar-nav">
        <ul>
          {menuItems.map((item) => (
            <li
              key={item.id}
              className={activePage === item.id ? "s-active" : ""}
            >
              <a
                href={item.path}
                aria-current={activePage === item.id ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  handleItemClick(item.path);
                }}
              >
                <span className="s-sidebar-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="s-sidebar-footer">
        <button className="s-logout-btn" onClick={handleLogoutClick}>
          <FiLogOut /> Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
