// context/StudentContext.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  type StudentPortalCredentialItem,
  type StudentPortalCredentialSummary,
  type StudentPortalSubject,
} from "../services/adminStorage";
import { studentApi, type StudentPortalCurrentTerm } from "../services/studentApi";
import type { Student } from "../types/student";
import { StudentContext } from "./student-context";

export const StudentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [student, setStudent] = useState<Student | null>(null);
  const [subjects, setSubjects] = useState<StudentPortalSubject[]>([]);
  const [currentTerm, setCurrentTerm] = useState<StudentPortalCurrentTerm | null>(
    null,
  );
  const [credentialItems, setCredentialItems] = useState<
    StudentPortalCredentialItem[]
  >([]);
  const [credentialSummary, setCredentialSummary] =
    useState<StudentPortalCredentialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadStudentRef = useRef<(showLoading?: boolean) => Promise<void>>(
    async () => {},
  );

  const applyPortalData = (portalData: {
    student: Student;
    subjects: StudentPortalSubject[];
    currentTerm: StudentPortalCurrentTerm;
    credentialItems: StudentPortalCredentialItem[];
    credentialSummary: StudentPortalCredentialSummary | null;
  }) => {
    setStudent(portalData.student);
    setSubjects(portalData.subjects);
    setCurrentTerm(portalData.currentTerm);
    setCredentialItems(portalData.credentialItems);
    setCredentialSummary(portalData.credentialSummary);
    setError(null);
  };

  const loadStudent = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const portalData = await studentApi.getStudentPortalData();
      applyPortalData(portalData);
    } catch (err) {
      setError("Failed to load profile data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshStudent = async () => {
    await loadStudent(true);
  };

  const updateStudent = async (data: Partial<Student>) => {
    try {
      const updated = await studentApi.updateProfile(data);
      setStudent(updated);
      await loadStudent(false);
    } catch (err) {
      setError("Failed to update profile");
      console.error(err);
    }
  };

  loadStudentRef.current = loadStudent;

  // Load data only once on mount
  useEffect(() => {
    loadStudent(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = () => {
      void loadStudentRef.current(false);
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return (
    <StudentContext.Provider
      value={{
        student,
        subjects,
        currentTerm,
        credentialItems,
        credentialSummary,
        isLoading,
        error,
        refreshStudent,
        updateStudent,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
};
