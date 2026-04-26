import React from "react";
import { FaLocationDot } from "react-icons/fa6";

interface BranchCardProps {
  branch: {
    code: string;
    name: string;
  };
  helperText?: string;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

export const BranchCard: React.FC<BranchCardProps> = ({
  branch,
  helperText,
  isSelected,
  isDisabled,
  onClick,
}) => {
  return (
    <div
      className={`choices ${isSelected ? "selected" : ""} ${isDisabled ? "disabled-branch" : ""}`}
      onClick={!isDisabled ? onClick : undefined}
      aria-disabled={isDisabled}
      style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
    >
      <span className="circle1">
        <FaLocationDot />
      </span>
      <div className="location-text">
        <p className="location">{branch.name}</p>
        <p className="campus">{helperText || `${branch.name} branch`}</p>
      </div>
    </div>
  );
};
