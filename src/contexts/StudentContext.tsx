// context/StudentContext.tsx
import React, { useState, useEffect } from "react";
import {
  type StudentPortalCredentialItem,
  type StudentPortalCredentialSummary,
  type StudentPortalSubject,
} from "../services/adminStorage";
import { studentApi } from "../services/studentApi";
import type { Student } from "../types/student";
import { StudentContext } from "./student-context";

export const StudentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [student, setStudent] = useState<Student | null>(null);
  const [subjects, setSubjects] = useState<StudentPortalSubject[]>([]);
  const [credentialItems, setCredentialItems] = useState<
    StudentPortalCredentialItem[]
  >([]);
  const [credentialSummary, setCredentialSummary] =
    useState<StudentPortalCredentialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStudent = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const portalData = await studentApi.getStudentPortalData();
      setStudent(portalData.student);
      setSubjects(portalData.subjects);
      setCredentialItems(portalData.credentialItems);
      setCredentialSummary(portalData.credentialSummary);
      setError(null);
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

  // Load data only once on mount
  useEffect(() => {
    loadStudent(true);
  }, []);

  return (
    <StudentContext.Provider
      value={{
        student,
        subjects,
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
