interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}

interface AssignmentSchedule {
  id: string;
  sectionId: string;
  subjectCode: string;
  academicYear: string;
  semester: string;
  schedule: ScheduleSlot[];
}

const clockMinutes = (value: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

// Returns the first problem, checking every weekly slot on both assignments.
export const getClassAssignmentScheduleError = (
  candidate: AssignmentSchedule,
  existingAssignments: AssignmentSchedule[],
): string | null => {
  for (const slot of candidate.schedule) {
    const start = clockMinutes(slot.startTime);
    const end = clockMinutes(slot.endTime);
    if (!slot.day.trim() || start === null || end === null || start >= end) {
      return "Every schedule row needs a day and valid start and end times, with the end time after the start time.";
    }
  }

  for (const existing of existingAssignments) {
    if (
      existing.id === candidate.id ||
      existing.sectionId !== candidate.sectionId ||
      existing.academicYear.trim() !== candidate.academicYear.trim() ||
      existing.semester !== candidate.semester
    ) continue;

    for (const slot of candidate.schedule) {
      for (const other of existing.schedule) {
        if (slot.day.trim().toLowerCase() !== other.day.trim().toLowerCase()) continue;
        const start = clockMinutes(slot.startTime);
        const end = clockMinutes(slot.endTime);
        const otherStart = clockMinutes(other.startTime);
        const otherEnd = clockMinutes(other.endTime);
        if (
          start !== null && end !== null && otherStart !== null && otherEnd !== null &&
          start < otherEnd && otherStart < end
        ) {
          return `Cannot save: ${candidate.subjectCode} overlaps with ${existing.subjectCode} on ${other.day} (${other.startTime}–${other.endTime}) in this section.`;
        }
      }
    }
  }
  return null;
};
