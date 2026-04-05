import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import ManagerSidebar from "./ManagerSidebar";
import { MdMenu } from "react-icons/md";
import "../../styles/manager/area-manager.css";

interface ManagerLayoutProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: string;
  canAccessBackup?: boolean;
}

const ManagerLayout: React.FC<ManagerLayoutProps> = (props) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;

    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobile, isSidebarOpen]);

  return (
    <div className="area-manager-container">
      {/* Mobile Topbar */}
      {isMobile && (
        <div className="mobile-topbar">
          <button
            className="hamburger-btn"
            onClick={() => setIsSidebarOpen(true)}
          >
            <MdMenu size={24} />
          </button>
          <span className="mobile-topbar-title">Area Manager Panel</span>
        </div>
      )}

      {/* Mobile Overlay */}
      {isMobile && isSidebarOpen && (
        <div
          className="mobile-overlay-backdrop"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <ManagerSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        {...props}
      />

      {/* Main Content */}
      <main
        className={`area-manager-content ${isMobile ? "content-mobile" : "content-desktop"}`}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default ManagerLayout;
