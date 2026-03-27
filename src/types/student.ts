// types/student.ts
export interface Student {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  contactNumber: string;
  address: string;
  program: string;
  yearLevel: string;
  branch: string;
  programType: 'SHS' | 'BS' | 'Short Course';
  gender: 'Male' | 'Female';
  birthday?: string;
  status: 'New' | 'Old' | 'Transferee' | 'Regular';
  civilStatus?: string;
  religion?: string;
  guardianName?: string;
  guardianContact?: string;
}
