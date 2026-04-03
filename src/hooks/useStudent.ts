import { useContext } from "react";
import { StudentContext } from "../contexts/student-context";

export const useStudent = () => {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error("useStudent must be used within StudentProvider");
  }

  return context;
};
