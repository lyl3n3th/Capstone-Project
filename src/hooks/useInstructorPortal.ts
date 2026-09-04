import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import {
  getInstructorScopedData,
  type InstructorGradeSubmission,
  getInstructorGradeSubmissions,
  fetchAndCacheInstructorGradeSubmissions,
} from "../services/instructorPortal";
import type {
  AcademicClassSectionRecord,
  AcademicInstructorRecord,
  AcademicSubjectAssignmentRecord,
} from "../services/academicData";
import type { StudentStorageRecord } from "../services/adminStorage";

export function useInstructorPortal() {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [instructor, setInstructor] = useState<AcademicInstructorRecord | null>(
    null,
  );
  const [assignments, setAssignments] = useState<
    AcademicSubjectAssignmentRecord[]
  >([]);
  const [sections, setSections] = useState<AcademicClassSectionRecord[]>([]);
  const [students, setStudents] = useState<StudentStorageRecord[]>([]);
  const [submissionsVersion, setSubmissionsVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!currentUser?.branch || !currentUser.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await getInstructorScopedData({
          branch: currentUser.branch,
          instructorId: currentUser.id,
        });

        if (!isMounted) {
          return;
        }

        setInstructor(data.instructor ?? null);
        setAssignments(data.assignments);
        setSections(data.sections);
        setStudents(data.students);
        void fetchAndCacheInstructorGradeSubmissions(currentUser.branch)
          .then(() => {
            if (isMounted) {
              setSubmissionsVersion((previousValue) => previousValue + 1);
            }
          })
          .catch((error) => {
            console.warn("Unable to load instructor submissions from Supabase.", error);
          });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.branch, currentUser?.id]);

  const submissions = useMemo<InstructorGradeSubmission[]>(() => {
    void submissionsVersion;
    return getInstructorGradeSubmissions(currentUser?.branch).filter(
      (submission) => submission.instructorId === currentUser?.id,
    );
  }, [currentUser?.branch, currentUser?.id, submissionsVersion]);

  return {
    currentUser,
    instructor,
    assignments,
    sections,
    students,
    submissions,
    isLoading,
    refreshSubmissions: () =>
      setSubmissionsVersion((previousValue) => previousValue + 1),
  };
}
