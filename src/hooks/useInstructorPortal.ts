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
  AcademicSubjectRecord,
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
  const [subjects, setSubjects] = useState<AcademicSubjectRecord[]>([]);
  const [students, setStudents] = useState<StudentStorageRecord[]>([]);
  const [submissionsVersion, setSubmissionsVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let revision = 0;

    const load = async () => {
      const requestRevision = ++revision;
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

        if (!isMounted || requestRevision !== revision) {
          return;
        }

        setInstructor(data.instructor ?? null);
        setAssignments(data.assignments);
        setSections(data.sections);
        setSubjects(data.snapshot.subjects);
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
        if (isMounted && requestRevision === revision) {
          setIsLoading(false);
        }
      }
    };

    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", onFocus);
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
    subjects,
    students,
    submissions,
    isLoading,
    refreshSubmissions: () =>
      setSubmissionsVersion((previousValue) => previousValue + 1),
  };
}
