import { FaHome, FaGraduationCap } from "react-icons/fa";
import { IoPersonSharp } from "react-icons/io5";
import { BsCardList } from "react-icons/bs";
import { IoBookSharp } from "react-icons/io5";
import { MdOutlineNoteAlt } from "react-icons/md";
import { FiLogOut } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

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
    <div className={`s-sidebar ${isOpen ? "s-open" : ""}`}>
      <div className="s-sidebar-header">
        <div className="s-school-name">Asian Institute of Computer Studies</div>
        <div className="s-branch-name">
          {currentUser?.branch || "Bacoor"} Branch
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
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleItemClick(item.path);
                }}
              >
                {item.icon} {item.label}
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
    </div>
  );
}

export default Sidebar;
