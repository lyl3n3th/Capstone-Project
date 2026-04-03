import { createContext } from "react";
import type {
  StudentPortalCredentialItem,
  StudentPortalCredentialSummary,
  StudentPortalSubject,
} from "../services/adminStorage";
import type { Student } from "../types/student";

export interface StudentContextType {
  student: Student | null;
  subjects: StudentPortalSubject[];
  credentialItems: StudentPortalCredentialItem[];
  credentialSummary: StudentPortalCredentialSummary | null;
  isLoading: boolean;
  error: string | null;
  refreshStudent: () => Promise<void>;
  updateStudent: (data: Partial<Student>) => Promise<void>;
}

export const StudentContext = createContext<StudentContextType | undefined>(
  undefined,
);
