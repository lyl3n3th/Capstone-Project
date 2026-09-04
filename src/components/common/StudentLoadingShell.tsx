import Header from "./Header";
import Sidebar from "./Sidebar";
import SkeletonPage from "./SkeletonPage";

type SkeletonPageVariant = "dashboard" | "table" | "form" | "upload";

interface StudentLoadingShellProps {
  activePage: string;
  currentDate: string;
  headerTitle: string;
  onLogout?: () => void;
  onMenuClick: () => void;
  onSidebarClose: () => void;
  portalClassName?: string;
  skeletonTitle: string;
  studentData: {
    name: string;
    id: string;
    progrm: string;
  };
  variant: SkeletonPageVariant;
  sidebarOpen: boolean;
}

export default function StudentLoadingShell({
  activePage,
  currentDate,
  headerTitle,
  onLogout,
  onMenuClick,
  onSidebarClose,
  portalClassName = "",
  skeletonTitle,
  studentData,
  variant,
  sidebarOpen,
}: StudentLoadingShellProps) {
  return (
    <div className={`s-portal ${portalClassName}`.trim()}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={onSidebarClose}
        activePage={activePage}
        onLogout={onLogout}
      />

      {sidebarOpen && <div className="s-overlay" onClick={onSidebarClose}></div>}

      <div className="s-main">
        <Header
          title={headerTitle}
          onMenuClick={onMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />
        <main className="s-content">
          <SkeletonPage
            eyebrow="Student Portal"
            title={skeletonTitle}
            variant={variant}
          />
        </main>
      </div>
    </div>
  );
}
