import type { StudentScheduledAssignmentItem } from "./adminStorage";
import type { StoredStudentGradeRecord } from "./studentGrades";

export interface EnrollmentRetakeRequestItem {
  subjectId?: string;
  subjectCode: string;
  subjectTitle: string;
  evaluation: "Failed" | "Incomplete";
  gradingPeriods: string[];
}

export interface EnrollmentRequestedLoadRecord {
  mode: "retake";
  subjects: EnrollmentRetakeRequestItem[];
  scheduledAssignments: StudentScheduledAssignmentItem[];
}

export interface EnrollmentRetakeChoiceGroup {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  units?: number;
  assignmentOptions: StudentScheduledAssignmentItem[];
  evaluation: "Failed" | "Incomplete";
  gradingPeriods: string[];
}

export interface ScheduledAssignmentConflict {
  leftAssignmentId: string;
  rightAssignmentId: string;
  message: string;
}

export const buildEnrollmentSubjectKey = ({
  code,
  title,
}: {
  code: string;
  title: string;
}) => `${code.trim().toUpperCase()}::${title.trim().toUpperCase()}`;

export const isCollegeTerminalGradeRecord = (
  record: StoredStudentGradeRecord,
) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  return (
    normalizedPeriod === "overall" ||
    normalizedPeriod === "final" ||
    normalizedPeriod === normalizedSemester
  );
};

export const getRequiredShsQuarterLabels = (semester: string) =>
  semester.trim().toLowerCase().includes("2nd")
    ? ["3rd Quarter", "4th Quarter"]
    : ["1st Quarter", "2nd Quarter"];

const getRetakeSubjectPriority = (
  evaluation: EnrollmentRetakeRequestItem["evaluation"],
) => (evaluation === "Incomplete" ? 2 : 1);

export const isRetakeEvaluation = (
  evaluation: StoredStudentGradeRecord["evaluation"],
): evaluation is EnrollmentRetakeRequestItem["evaluation"] =>
  evaluation === "Failed" || evaluation === "Incomplete";

const isRetakeGradeRecord = (
  record: StoredStudentGradeRecord,
): record is StoredStudentGradeRecord & {
  evaluation: EnrollmentRetakeRequestItem["evaluation"];
} => isRetakeEvaluation(record.evaluation);

export const getRetakeEvaluationLabel = (
  evaluation: EnrollmentRetakeRequestItem["evaluation"],
) => (evaluation === "Incomplete" ? "INC" : "FAILED");

export const getEnrollmentRetakeRequestItems = ({
  program,
  semester,
  gradeRecords,
}: {
  program: "SHS" | "College";
  semester: string;
  gradeRecords: StoredStudentGradeRecord[];
}) => {
  const groupedItems = new Map<string, EnrollmentRetakeRequestItem>();

  if (program === "College") {
    gradeRecords
      .filter(isRetakeGradeRecord)
      .filter((record) => isCollegeTerminalGradeRecord(record))
      .forEach((record) => {
        const key = buildEnrollmentSubjectKey({
          code: record.subjectCode,
          title: record.subjectTitle,
        });
        const existingItem = groupedItems.get(key);

        if (
          !existingItem ||
          getRetakeSubjectPriority(record.evaluation) >=
            getRetakeSubjectPriority(existingItem.evaluation)
        ) {
          groupedItems.set(key, {
            subjectCode: record.subjectCode,
            subjectTitle: record.subjectTitle,
            evaluation: record.evaluation,
            gradingPeriods: [record.gradingPeriod],
          });
          return;
        }

        groupedItems.set(key, {
          ...existingItem,
          gradingPeriods: Array.from(
            new Set([...existingItem.gradingPeriods, record.gradingPeriod]),
          ),
        });
      });

    return Array.from(groupedItems.values()).sort(
      (left, right) =>
        left.subjectCode.localeCompare(right.subjectCode) ||
        left.subjectTitle.localeCompare(right.subjectTitle),
    );
  }

  const requiredQuarterLabels = getRequiredShsQuarterLabels(semester);
  const subjectRecordsByKey = new Map<string, StoredStudentGradeRecord[]>();

  gradeRecords
    .filter((record) => requiredQuarterLabels.includes(record.gradingPeriod))
    .forEach((record) => {
      const key = buildEnrollmentSubjectKey({
        code: record.subjectCode,
        title: record.subjectTitle,
      });
      const existingRecords = subjectRecordsByKey.get(key) ?? [];
      subjectRecordsByKey.set(key, [...existingRecords, record]);
    });

  subjectRecordsByKey.forEach((records) => {
    const postedPeriods = new Set(records.map((record) => record.gradingPeriod));
    const hasCompleteSemesterGrades = requiredQuarterLabels.every((label) =>
      postedPeriods.has(label),
    );

    if (!hasCompleteSemesterGrades) {
      return;
    }

    const flaggedRecords = records.filter(isRetakeGradeRecord);

    if (flaggedRecords.length === 0) {
      return;
    }

    const topSeverityRecord = flaggedRecords.reduce((selected, current) =>
      getRetakeSubjectPriority(current.evaluation) >=
      getRetakeSubjectPriority(selected.evaluation)
        ? current
        : selected,
    );
    const key = buildEnrollmentSubjectKey({
      code: topSeverityRecord.subjectCode,
      title: topSeverityRecord.subjectTitle,
    });

    groupedItems.set(key, {
      subjectCode: topSeverityRecord.subjectCode,
      subjectTitle: topSeverityRecord.subjectTitle,
      evaluation: topSeverityRecord.evaluation,
      gradingPeriods: flaggedRecords.map((record) => record.gradingPeriod),
    });
  });

  return Array.from(groupedItems.values()).sort(
    (left, right) =>
      left.subjectCode.localeCompare(right.subjectCode) ||
      left.subjectTitle.localeCompare(right.subjectTitle),
  );
};

const parseClockToMinutes = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatClockLabel = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const [rawHour, rawMinute] = value.split(":").map(Number);
  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return `${hour}:${rawMinute.toString().padStart(2, "0")} ${suffix}`;
};

export const formatScheduledAssignmentLabel = (
  assignment: Pick<
    StudentScheduledAssignmentItem,
    "sectionCode" | "schedule" | "instructorName"
  >,
) =>
  `${assignment.sectionCode || "No section"} - ${
    assignment.schedule.length > 0
      ? assignment.schedule
          .map(
            (slot) =>
              `${slot.day.slice(0, 3)} ${formatClockLabel(slot.startTime)}-${formatClockLabel(slot.endTime)} @ ${slot.room || "TBA"}`,
          )
          .join(" / ")
      : "Schedule pending"
  }${assignment.instructorName ? ` - ${assignment.instructorName}` : ""}`;

export const buildScheduledAssignmentConflicts = (
  assignments: Pick<
    StudentScheduledAssignmentItem,
    "assignmentId" | "subjectCode" | "schedule"
  >[],
): ScheduledAssignmentConflict[] => {
  const conflicts: ScheduledAssignmentConflict[] = [];

  for (let leftIndex = 0; leftIndex < assignments.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < assignments.length;
      rightIndex += 1
    ) {
      const left = assignments[leftIndex];
      const right = assignments[rightIndex];

      const hasConflict = left.schedule.some((leftSlot) =>
        right.schedule.some((rightSlot) => {
          if (leftSlot.day !== rightSlot.day) {
            return false;
          }

          const leftStart = parseClockToMinutes(leftSlot.startTime);
          const leftEnd = parseClockToMinutes(leftSlot.endTime);
          const rightStart = parseClockToMinutes(rightSlot.startTime);
          const rightEnd = parseClockToMinutes(rightSlot.endTime);

          if (
            leftStart === null ||
            leftEnd === null ||
            rightStart === null ||
            rightEnd === null
          ) {
            return false;
          }

          return leftStart < rightEnd && rightStart < leftEnd;
        }),
      );

      if (!hasConflict) {
        continue;
      }

      conflicts.push({
        leftAssignmentId: left.assignmentId,
        rightAssignmentId: right.assignmentId,
        message: `${left.subjectCode} conflicts with ${right.subjectCode}.`,
      });
    }
  }

  return conflicts;
};
