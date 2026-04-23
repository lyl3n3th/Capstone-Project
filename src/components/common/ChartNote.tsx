import type { ReactNode } from "react";
import { FiInfo } from "react-icons/fi";
import "../../styles/components/chart-note.css";

interface ChartNoteProps {
  children: ReactNode;
  title?: string;
  variant?: "default" | "compact";
}

export default function ChartNote({
  children,
  title = "Overview",
  variant = "default",
}: ChartNoteProps) {
  return (
    <div className={`chart-note chart-note--${variant}`} role="note">
      <div className="chart-note-icon" aria-hidden="true">
        <FiInfo />
      </div>
      <div className="chart-note-copy">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
