// components/student/Header.tsx
import "../../styles/components/header.css";
import { IoMenu } from "react-icons/io5";
import { useState, useEffect } from "react";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  studentData?: {
    name: string;
    id: string;
    progrm: string;
  };
  currentDate?: string;
}

function Header({
  title,
  onMenuClick,
  studentData = {
    name: "Hener C. Verdida",
    id: "20221131",
    progrm: "SHS",
  },
  currentDate,
}: HeaderProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <header className="s-header" aria-label={title}>
      <div className="s-header-left">
        <button className="s-menu-toggle" onClick={onMenuClick}>
          <IoMenu size={24} />
        </button>

        {/* Desktop User Profile (visible on desktop only) */}
        {!isMobile && (
          <div className="s-user-profile">
            <div className="s-user-avatar">{getInitials(studentData.name)}</div>
            <div className="s-user-details">
              <span className="s-user-name">{studentData.name}</span>
              <div className="s-user-line">
                <span className="s-user-id">{studentData.id}</span>
                <span className="s-user-prog">{studentData.progrm}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="s-header-right">
        {/* Desktop Date (visible on desktop only) */}
        {!isMobile && <div className="s-header-date">{currentDate}</div>}

        {/* Mobile User Profile (visible on mobile only) */}
        {isMobile && (
          <div className="s-user-profile-mobile">
            <div className="s-user-avatar">{getInitials(studentData.name)}</div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
