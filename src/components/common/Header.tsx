// components/student/Header.tsx
import "../../styles/components/header.css";
import { IoMenu } from "react-icons/io5";
import { MdCameraAlt } from "react-icons/md";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useStoredProfileImage } from "../../hooks/useStoredProfileImage";

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
    id: "BAC-261001",
    progrm: "SHS",
  },
  currentDate,
}: HeaderProps) {
  const { currentUser } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { profileImage, updateProfileImage } = useStoredProfileImage(currentUser);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        desktopMenuRef.current?.contains(target) ||
        mobileMenuRef.current?.contains(target)
      ) {
        return;
      }

      setShowProfileMenu(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const handleProfileImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await updateProfileImage(file);
      setShowProfileMenu(false);
    } catch (error) {
      console.error("Failed to update student profile image", error);
      alert(error instanceof Error ? error.message : "Failed to update picture.");
    } finally {
      event.target.value = "";
    }
  };

  const avatarLabel = `${studentData.name} profile`;
  const avatarInitials = getInitials(studentData.name);

  const renderAvatarButton = () => (
    <>
      <button
        type="button"
        className="s-avatar-button"
        onClick={() => setShowProfileMenu((previousValue) => !previousValue)}
        aria-label={avatarLabel}
      >
        {profileImage ? (
          <img
            src={profileImage}
            alt={avatarLabel}
            className="s-user-avatar-image"
          />
        ) : (
          <div className="s-user-avatar">{avatarInitials}</div>
        )}
      </button>
    </>
  );

  const renderProfileMenu = (menuClassName: string) =>
    showProfileMenu ? (
      <div className={`s-profile-menu ${menuClassName}`}>
        <button
          type="button"
          className="s-profile-action"
          onClick={() => fileInputRef.current?.click()}
        >
          <MdCameraAlt size={18} /> Change Picture
        </button>
      </div>
    ) : null;

  return (
    <header className="s-header" aria-label={title}>
      <div className="s-header-left">
        <button className="s-menu-toggle" onClick={onMenuClick}>
          <IoMenu size={24} />
        </button>

        {/* Desktop User Profile (visible on desktop only) */}
        {!isMobile && (
          <div className="s-user-profile" ref={desktopMenuRef}>
            <div className="s-profile-avatar-wrapper">{renderAvatarButton()}</div>
            <div className="s-user-details">
              <span className="s-user-name">{studentData.name}</span>
              <div className="s-user-line">
                <span className="s-user-id">{studentData.id}</span>
                <span className="s-user-prog">{studentData.progrm}</span>
              </div>
            </div>
            {renderProfileMenu("s-profile-menu-desktop")}
          </div>
        )}
      </div>

      <div className="s-header-right">
        {/* Desktop Date (visible on desktop only) */}
        {!isMobile && <div className="s-header-date">{currentDate}</div>}

        {/* Mobile User Profile (visible on mobile only) */}
        {isMobile && (
          <div className="s-user-profile-mobile" ref={mobileMenuRef}>
            {renderAvatarButton()}
            {renderProfileMenu("s-profile-menu-mobile")}
          </div>
        )}
      </div>

      <input
        type="file"
        hidden
        ref={fileInputRef}
        accept="image/*"
        onChange={handleProfileImageChange}
      />
    </header>
  );
}

export default Header;
