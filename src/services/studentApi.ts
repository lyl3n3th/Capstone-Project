// services/studentApi.ts
import type { Student } from '../types/student';
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";

// Mock data - matches your current profile data
const mockStudent: Student = {
  id: '1',
  studentNumber: '20221131',
  firstName: 'Hener',
  lastName: 'Verdida',
  middleName: 'C.',
  email: 'hener.verdida@gmail.com',
  contactNumber: '0912 345 6789',
  address: 'Blk 15 Lot 8, Phase 2, Green Valley Subdivision, Molino 3, Bacoor, Cavite',
  program: 'Technical Livelihood Track - ICT',
  yearLevel: 'Grade-11',
  branch: 'Bacoor',
  programType: 'SHS',
  gender: 'Male',
  birthday: '2008-01-15',
  status: 'Regular',
  civilStatus: 'Single',
  religion: 'Roman Catholic',
  guardianName: 'Erlinda C. Verdida',
  guardianContact: '0923 456 7890',
};

const getStudentSessionOverrides = (): Partial<Student> => {
  if (typeof window === "undefined") {
    return {};
  }

  const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawSession) {
    return {};
  }

  try {
    const parsedSession = JSON.parse(rawSession) as AuthSession;

    if (parsedSession.user.role !== "student") {
      return {};
    }

    return {
      id: parsedSession.user.id,
      studentNumber:
        parsedSession.user.studentNumber || mockStudent.studentNumber,
      branch: parsedSession.user.branch || mockStudent.branch,
    };
  } catch (error) {
    console.error("Failed to read student session overrides", error);
    return {};
  }
};

export const studentApi = {
  async getStudent(): Promise<Student> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return { ...mockStudent, ...getStudentSessionOverrides() };
  },
  
  async updateProfile(data: Partial<Student>): Promise<Student> {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Updating profile:', data);
    return { ...mockStudent, ...data };
  },
};
