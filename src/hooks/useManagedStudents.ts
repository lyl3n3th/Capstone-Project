import { useEffect, useState } from "react";
import { STORED_STUDENTS_UPDATED_EVENT } from "../services/adminStorage";
import { fetchManagedStudentSnapshot, type ManagedStudentSnapshot } from "../services/managerStudents";

export const useManagedStudents = () => {
  const [snapshot, setSnapshot] = useState<ManagedStudentSnapshot>({ branches: [], students: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const currentRequest = ++request;
      try {
        const latest = await fetchManagedStudentSnapshot();
        if (active && currentRequest === request) {
          setSnapshot(latest);
          setHasLoaded(true);
          setError("");
        }
      } catch (failure) {
        if (active && currentRequest === request) {
          setError(failure instanceof Error ? failure.message : "Unable to load student records.");
        }
      } finally {
        if (active && currentRequest === request) setIsLoading(false);
      }
    };
    const sync = () => { void refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "aics-students") sync();
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener(STORED_STUDENTS_UPDATED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(STORED_STUDENTS_UPDATED_EVENT, sync);
    };
  }, [revision]);

  return { ...snapshot, isLoading, hasLoaded, error, retry: () => setRevision((value) => value + 1) };
};
