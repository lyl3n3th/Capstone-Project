import React from "react";
import { FaLocationDot } from "react-icons/fa6";

interface BranchCardProps {
  branch: {
    code: string;
    name: string;
  };
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

export const BranchCard: React.FC<BranchCardProps> = ({
  branch,
  isSelected,
  isDisabled,
  onClick,
}) => {
  return (
    <div
      className={`choices ${isSelected ? "selected" : ""} ${isDisabled ? "disabled-branch" : ""}`}
      onClick={!isDisabled ? onClick : undefined}
      style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
    >
      <span className="circle1">
        <FaLocationDot />
      </span>
      <div className="location-text">
        <p className="location">{branch.name}</p>
        <p className="campus">{branch.name} branch</p>
      </div>
    </div>
  );
};
