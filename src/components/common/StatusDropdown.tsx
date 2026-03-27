import React, { useRef, useEffect } from "react";
import "../../styles/components/dropdown.css";

interface StatusDropdownProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const StatusDropdown: React.FC<StatusDropdownProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = "Select Status",
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="dropdownb" ref={wrapperRef}>
      <label>{label}</label>
      <div
        className={`selectb ${isOpen ? "select-clicked" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="selected">
          {value !== "Select Status" ? value : placeholder}
        </span>
        <div className={`cartb ${isOpen ? "cart-rotate" : ""}`}></div>
      </div>
      <ul className={`menub ${isOpen ? "show" : ""}`}>
        {options.map((opt) => (
          <li
            key={opt}
            onClick={() => {
              onChange(opt);
              setIsOpen(false);
            }}
          >
            {opt}
          </li>
        ))}
      </ul>
    </div>
  );
};
