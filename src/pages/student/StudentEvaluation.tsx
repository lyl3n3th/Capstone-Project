import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaChalkboardTeacher,
  FaClipboardList,
  FaLock,
  FaLockOpen,
} from "react-icons/fa";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { useStudent } from "../../hooks/useStudent";
import {
  readInstructorEvaluationStatuses,
  type InstructorEvaluationStatusMap,
  type StudentPortalSubject,
} from "../../services/adminStorage";
import "../../styles/main.css";

const evaluationQuestionPlaceholders = [
  "Teaching effectiveness",
  "Classroom engagement",
  "Professionalism and punctuality",
  "Assessment fairness",
];

type EvaluationCardState = "open" | "closed" | "unavailable";

interface EvaluationCard {
  key: string;
  instructorId?: string;
  instructorName: string;
  state: EvaluationCardState;
  subjects: StudentPortalSubject[];
}

const evaluationStateSortOrder: Record<EvaluationCardState, number> = {
  open: 0,
  closed: 1,
  unavailable: 2,
};

const getResolvedInstructorName = (subject: StudentPortalSubject) => {
  const trimmedName = subject.professor?.trim();

  if (trimmedName && trimmedName.toLowerCase() !== "tba") {
    return trimmedName;
  }

  return subject.instructorId ? "Assigned Instructor" : "Instructor TBA";
};

const getEvaluationCardState = (
  subject: StudentPortalSubject,
  evaluationStatuses: InstructorEvaluationStatusMap,
): EvaluationCardState => {
  const instructorId = subject.instructorId?.trim();
  const hasResolvedInstructor =
    getResolvedInstructorName(subject) !== "Instructor TBA";

  if (!instructorId || !hasResolvedInstructor) {
    return "unavailable";
  }

  return evaluationStatuses[instructorId]?.isOpen ? "open" : "closed";
};

const getEvaluationStateLabel = (state: EvaluationCardState) => {
  if (state === "open") {
    return "Evaluation Open";
  }

  if (state === "closed") {
    return "Waiting for Opening";
  }

  return "Instructor Setup Needed";
};

const getEvaluationStateCopy = (state: EvaluationCardState) => {
  if (state === "open") {
    return "Academic Management opened this evaluation. You can review the placeholder questions below.";
  }

  if (state === "closed") {
    return "Academic Management has not opened this instructor evaluation yet.";
  }

  return "This subject still needs a linked instructor assignment before the evaluation can appear here.";
};

function StudentEvaluation() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [evaluationStatuses, setEvaluationStatuses] =
    useState<InstructorEvaluationStatusMap>({});
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { student, subjects, currentTerm, isLoading } = useStudent();

  useEffect(() => {
    const syncEvaluationStatuses = () => {
      setEvaluationStatuses(readInstructorEvaluationStatuses(student?.branch));
    };

    syncEvaluationStatuses();

    const handleWindowRefresh = () => {
      syncEvaluationStatuses();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncEvaluationStatuses();
      }
    };

    window.addEventListener("storage", handleWindowRefresh);
    window.addEventListener("focus", handleWindowRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleWindowRefresh);
      window.removeEventListener("focus", handleWindowRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [student?.branch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

  const currentTermSubjects = useMemo(() => {
    if (currentTerm?.academicYear && currentTerm?.semester) {
      return subjects.filter(
        (subject) =>
          subject.academicYear === currentTerm.academicYear &&
          subject.semester === currentTerm.semester,
      );
    }

    return subjects;
  }, [currentTerm?.academicYear, currentTerm?.semester, subjects]);

  const evaluationCards = useMemo(() => {
    const cards = new Map<string, EvaluationCard>();

    currentTermSubjects.forEach((subject) => {
      const instructorId = subject.instructorId?.trim() || undefined;
      const instructorName = getResolvedInstructorName(subject);
      const fallbackKey =
        instructorName !== "Instructor TBA"
          ? `name:${instructorName.toLowerCase()}`
          : `subject:${subject.id}`;
      const cardKey = instructorId ? `id:${instructorId}` : fallbackKey;
      const nextState = getEvaluationCardState(subject, evaluationStatuses);
      const existingCard = cards.get(cardKey);

      if (existingCard) {
        existingCard.subjects.push(subject);

        if (
          evaluationStateSortOrder[nextState] <
          evaluationStateSortOrder[existingCard.state]
        ) {
          existingCard.state = nextState;
        }

        return;
      }

      cards.set(cardKey, {
        key: cardKey,
        instructorId,
        instructorName,
        state: nextState,
        subjects: [subject],
      });
    });

    return Array.from(cards.values())
      .map((card) => ({
        ...card,
        subjects: [...card.subjects].sort(
          (left, right) =>
            left.code.localeCompare(right.code) ||
            left.title.localeCompare(right.title),
        ),
      }))
      .sort((left, right) => {
        const stateComparison =
          evaluationStateSortOrder[left.state] -
          evaluationStateSortOrder[right.state];

        if (stateComparison !== 0) {
          return stateComparison;
        }

        return left.instructorName.localeCompare(right.instructorName);
      });
  }, [currentTermSubjects, evaluationStatuses]);

  useEffect(() => {
    if (
      expandedCardKey &&
      !evaluationCards.some(
        (card) => card.key === expandedCardKey && card.state === "open",
      )
    ) {
      setExpandedCardKey(null);
    }
  }, [evaluationCards, expandedCardKey]);

  const openEvaluationsCount = evaluationCards.filter(
    (card) => card.state === "open",
  ).length;
  const closedEvaluationsCount = evaluationCards.filter(
    (card) => card.state === "closed",
  ).length;
  const unavailableEvaluationsCount = evaluationCards.filter(
    (card) => card.state === "unavailable",
  ).length;

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentData = {
    name: student ? `${student.firstName} ${student.lastName}` : "Student",
    id: student?.studentNumber || "",
    progrm: student?.programType || "SHS",
  };

  const currentAcademicYear =
    currentTerm?.academicYear ||
    currentTermSubjects[0]?.academicYear ||
    "Current Academic Year";
  const currentSemester =
    currentTerm?.semester ||
    currentTermSubjects[0]?.semester ||
    "Current Semester";

  const handleMenuClick = () => {
    setSidebarOpen((previousValue) => !previousValue);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleLogout = () => {};

  const handleTogglePlaceholder = (cardKey: string) => {
    setExpandedCardKey((previousValue) =>
      previousValue === cardKey ? null : cardKey,
    );
  };

  if (isLoading && !student) {
    return (
      <div className="s-portal">
        <div style={{ minHeight: "100vh" }}></div>
      </div>
    );
  }

  return (
    <div className="s-portal">
      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="evaluation"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      <div className="s-main">
        <Header
          title="Evaluation"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content s-evaluation-page">
          <section className="s-evaluation-hero">
            <div className="s-evaluation-hero-copy">
              <span className="s-evaluation-kicker">
                Student to Instructor Evaluation
              </span>
              <h1>Evaluation</h1>
              <p>
                This page shows which instructor evaluations are currently open
                for your loaded subjects. The final questionnaire is still being
                prepared, so the question set below is only a placeholder for
                now.
              </p>
            </div>
            <div className="s-evaluation-term-card">
              <span>{currentAcademicYear}</span>
              <strong>{currentSemester}</strong>
            </div>
          </section>

          <div className="s-subjects-summary s-evaluation-summary">
            <div className="s-summary-card">
              <h4>Open Evaluations</h4>
              <div className="s-summary-value">{openEvaluationsCount}</div>
            </div>
            <div className="s-summary-card">
              <h4>Waiting to Open</h4>
              <div className="s-summary-value">{closedEvaluationsCount}</div>
            </div>
            <div className="s-summary-card">
              <h4>Instructor Setup Needed</h4>
              <div className="s-summary-value">{unavailableEvaluationsCount}</div>
            </div>
          </div>

          {evaluationCards.length > 0 ? (
            <section className="s-evaluation-grid">
              {evaluationCards.map((card) => {
                const isExpanded = expandedCardKey === card.key;

                return (
                  <article
                    key={card.key}
                    className={`s-evaluation-card s-evaluation-card-${card.state}`}
                  >
                    <div className="s-evaluation-card-top">
                      <div className="s-evaluation-card-icon">
                        <FaChalkboardTeacher />
                      </div>
                      <div className="s-evaluation-card-copy">
                        <h3>{card.instructorName}</h3>
                        <p>
                          {card.subjects.length} subject
                          {card.subjects.length === 1 ? "" : "s"} in this term
                        </p>
                      </div>
                      <span
                        className={`s-evaluation-state s-evaluation-state-${card.state}`}
                      >
                        {card.state === "open" ? <FaLockOpen /> : <FaLock />}
                        {getEvaluationStateLabel(card.state)}
                      </span>
                    </div>

                    <div className="s-evaluation-subject-list">
                      {card.subjects.map((subject) => (
                        <span
                          key={`${card.key}-${subject.id}`}
                          className="s-evaluation-subject-chip"
                        >
                          {subject.code} - {subject.title}
                        </span>
                      ))}
                    </div>

                    <p className="s-evaluation-card-note">
                      {getEvaluationStateCopy(card.state)}
                    </p>

                    {card.state === "open" ? (
                      <>
                        <button
                          type="button"
                          className="s-evaluation-action"
                          onClick={() => handleTogglePlaceholder(card.key)}
                          aria-expanded={isExpanded}
                        >
                          <FaClipboardList />
                          {isExpanded
                            ? "Hide Placeholder Questions"
                            : "View Placeholder Questions"}
                        </button>

                        {isExpanded ? (
                          <div className="s-evaluation-placeholder-panel">
                            <div className="s-evaluation-placeholder-head">
                              <strong>Questions In Progress</strong>
                              <span>
                                Final submission will be enabled after the
                                questionnaire is finished.
                              </span>
                            </div>
                            <div className="s-evaluation-placeholder-list">
                              {evaluationQuestionPlaceholders.map((label) => (
                                <div
                                  key={`${card.key}-${label}`}
                                  className="s-evaluation-placeholder-item"
                                >
                                  <span>{label}</span>
                                  <strong>In Progress</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : (
            <div className="s-no-subjects s-evaluation-empty-state">
              <p>
                No current-term subjects are posted yet, so there are no
                instructor evaluations to show right now.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default StudentEvaluation;
