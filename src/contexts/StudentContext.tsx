// context/StudentContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { studentApi } from "../services/studentApi";
import type { Student } from "../types/student";

interface Subject {
  id: string;
  code: string;
  title: string;
  units?: number;
  schedule: string;
  room: string;
  professor: string;
  days: string;
  time: string;
  semester: string;
  academicYear: string;
}

interface StudentContextType {
  student: Student | null;
  subjects: Subject[];
  isLoading: boolean;
  error: string | null;
  refreshStudent: () => Promise<void>;
  updateStudent: (data: Partial<Student>) => Promise<void>;
}

const StudentContext = createContext<StudentContextType | undefined>(undefined);

// Mock subjects data
const mockSubjectsSHS: Subject[] = [
  {
    id: "1",
    code: "ENG112",
    title: "Reading and Writing Skills",
    schedule: "MWF 8:00-9:00",
    room: "Room 101",
    professor: "Prof. Santos",
    days: "MWF",
    time: "8:00 AM - 9:00 AM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "2",
    code: "FIL112",
    title: "Pagbabasa at Pagsusuri ng Iba't-ibang Teksto",
    schedule: "TTH 10:00-11:30",
    room: "Room 102",
    professor: "Prof. Reyes",
    days: "TTH",
    time: "10:00 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "3",
    code: "NTS112",
    title: "Physical Science",
    schedule: "MWF 10:30-11:30",
    room: "Room 103",
    professor: "Prof. Garcia",
    days: "MWF",
    time: "10:30 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "4",
    code: "CP1121",
    title: "Computer Programming 2 (.NET Technology NC III)",
    schedule: "TTH 1:00-3:00",
    room: "Computer Lab 1",
    professor: "Prof. Cruz",
    days: "TTH",
    time: "1:00 PM - 3:00 PM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "5",
    code: "MATH112",
    title: "General Mathematics",
    schedule: "MWF 9:00-10:00",
    room: "Room 104",
    professor: "Prof. Lopez",
    days: "MWF",
    time: "9:00 AM - 10:00 AM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "6",
    code: "SOC112",
    title: "Understanding Culture, Society and Politics",
    schedule: "TTH 3:30-5:00",
    room: "Room 105",
    professor: "Prof. Mendoza",
    days: "TTH",
    time: "3:30 PM - 5:00 PM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "7",
    code: "EAP112",
    title: "English for Academic and Professional Purposes",
    schedule: "TTH 3:30-5:00",
    room: "Room 105",
    professor: "Prof. Mendoza",
    days: "TTH",
    time: "3:30 PM - 5:00 PM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "8",
    code: "PRR1",
    title: "Practical Research 1",
    schedule: "TTH 3:30-5:00",
    room: "Room 105",
    professor: "Prof. Mendoza",
    days: "TTH",
    time: "3:30 PM - 5:00 PM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
];

const mockSubjectsCollege: Subject[] = [
  {
    id: "1",
    code: "CC101",
    title: "Introduction to Computing",
    units: 3,
    schedule: "MWF 8:00-9:00",
    room: "Room 101",
    professor: "Prof. Santos",
    days: "MWF",
    time: "8:00 AM - 9:00 AM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "2",
    code: "MATH101",
    title: "College Algebra",
    units: 3,
    schedule: "TTH 10:00-11:30",
    room: "Room 102",
    professor: "Prof. Reyes",
    days: "TTH",
    time: "10:00 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
  {
    id: "3",
    code: "ENGL101",
    title: "English Communication",
    units: 3,
    schedule: "MWF 10:30-11:30",
    room: "Room 103",
    professor: "Prof. Garcia",
    days: "MWF",
    time: "10:30 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2025-2026",
  },
];

export const StudentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [student, setStudent] = useState<Student | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStudent = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await studentApi.getStudent();
      setStudent(data);

      // Load subjects based on program type
      const isSHS = data?.programType === "SHS";
      if (isSHS) {
        setSubjects(mockSubjectsSHS);
      } else {
        setSubjects(mockSubjectsCollege);
      }

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

export const useStudent = () => {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error("useStudent must be used within StudentProvider");
  }
  return context;
};
