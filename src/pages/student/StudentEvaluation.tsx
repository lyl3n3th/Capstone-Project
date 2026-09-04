import { useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaChalkboardTeacher,
  FaCheckCircle,
  FaClipboardList,
  FaLock,
  FaLockOpen,
} from "react-icons/fa";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import StudentLoadingShell from "../../components/common/StudentLoadingShell";
import { useStudent } from "../../hooks/useStudent";
import {
  fetchEvaluationQuestionnaire,
  fetchInstructorEvaluationStatuses,
  fetchInstructorEvaluationSubmissions,
  readInstructorEvaluationSubmissions,
  saveInstructorEvaluationSubmission,
  saveInstructorEvaluationSubmissionToBackend,
  readEvaluationQuestionnaire,
  readInstructorEvaluationStatuses,
  type EvaluationQuestionCategoryRecord,
  type InstructorEvaluationStatusMap,
  type StudentPortalSubject,
} from "../../services/adminStorage";
import "../../styles/main.css";

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
    return "Evaluation Closed";
  }

  return "Instructor Setup Needed";
};

const getEvaluationStateCopy = (state: EvaluationCardState) => {
  if (state === "open") {
    return "Academic Management opened this evaluation. You can answer the configured questionnaire below.";
  }

  if (state === "closed") {
    return "Academic Management has not opened this instructor evaluation yet.";
  }

  return "This subject still needs a linked instructor assignment before the evaluation can appear here.";
};

const getQuestionType = (question: { type?: "rating" | "essay" }) =>
  question.type || "rating";

const getEvaluationSubjectKey = (subject: StudentPortalSubject) =>
  [
    subject.id || subject.code,
    subject.code,
    subject.academicYear,
    subject.semester,
  ]
    .join(":")
    .replace(/\s+/g, "_");

function StudentEvaluation() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeEvaluationKey, setActiveEvaluationKey] = useState<string | null>(
    null,
  );
  const [evaluationResponses, setEvaluationResponses] = useState<
    Record<string, Record<string, number | string>>
  >({});
  const [evaluationStatuses, setEvaluationStatuses] =
    useState<InstructorEvaluationStatusMap>({});
  const [evaluationQuestionnaire, setEvaluationQuestionnaire] = useState<
    EvaluationQuestionCategoryRecord[]
  >([]);
  const [submittedEvaluationIds, setSubmittedEvaluationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { student, subjects, currentTerm, isLoading } = useStudent();

  useEffect(() => {
    const syncEvaluationStatuses = () => {
      setEvaluationStatuses(readInstructorEvaluationStatuses(student?.branch));
      setEvaluationQuestionnaire(readEvaluationQuestionnaire(student?.branch));
      const localSubmissions = readInstructorEvaluationSubmissions(student?.branch);
      setSubmittedEvaluationIds(
        new Set(
          localSubmissions
            .filter(
              (submission) =>
                submission.studentNumber === (student?.studentNumber || student?.id),
            )
            .map((submission) => submission.id),
        ),
      );
      void Promise.all([
        fetchInstructorEvaluationStatuses(student?.branch).then(
          setEvaluationStatuses,
        ),
        fetchEvaluationQuestionnaire(student?.branch).then(
          setEvaluationQuestionnaire,
        ),
        fetchInstructorEvaluationSubmissions(student?.branch).then(
          (submissions) => {
            setSubmittedEvaluationIds(
              new Set(
                submissions
                  .filter(
                    (submission) =>
                      submission.studentNumber ===
                      (student?.studentNumber || student?.id),
                  )
                  .map((submission) => submission.id),
              ),
            );
          },
        ),
      ]).catch((error) => {
        console.warn("Failed to sync evaluation setup from Supabase.", error);
      });
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
  }, [student?.branch, student?.id, student?.studentNumber]);

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

  const currentTermAcademicYear = currentTerm?.academicYear;
  const currentTermSemester = currentTerm?.semester;

  const currentTermSubjects =
    currentTermAcademicYear && currentTermSemester
      ? subjects.filter(
          (subject) =>
            subject.academicYear === currentTermAcademicYear &&
            subject.semester === currentTermSemester,
        )
      : subjects;
  const evaluationCardMap = new Map<string, EvaluationCard>();

  currentTermSubjects.forEach((subject) => {
    const instructorId = subject.instructorId?.trim() || undefined;
    const instructorName = getResolvedInstructorName(subject);
    const subjectKey = getEvaluationSubjectKey(subject);
    const fallbackKey =
      instructorName !== "Instructor TBA"
        ? `name:${instructorName.toLowerCase()}:${subjectKey}`
        : `subject:${subjectKey}`;
    const cardKey = instructorId ? `id:${instructorId}:${subjectKey}` : fallbackKey;
    const nextState = getEvaluationCardState(subject, evaluationStatuses);
    const existingCard = evaluationCardMap.get(cardKey);

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

    evaluationCardMap.set(cardKey, {
      key: cardKey,
      instructorId,
      instructorName,
      state: nextState,
      subjects: [subject],
    });
  });

  const evaluationCards = Array.from(evaluationCardMap.values())
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

      return (
        left.instructorName.localeCompare(right.instructorName) ||
        (left.subjects[0]?.code || "").localeCompare(
          right.subjects[0]?.code || "",
        ) ||
        (left.subjects[0]?.title || "").localeCompare(
          right.subjects[0]?.title || "",
        )
      );
    });
  const totalQuestionnaireItems = evaluationQuestionnaire.reduce(
    (total, category) => total + category.questions.length,
    0,
  );
  const hasRatingQuestionnaireItems = evaluationQuestionnaire.some((category) =>
    category.questions.some((question) => getQuestionType(question) === "rating"),
  );
  const requiredQuestionnaireItems = evaluationQuestionnaire.reduce(
    (total, category) =>
      total +
      category.questions.filter((question) =>
        hasRatingQuestionnaireItems
          ? getQuestionType(question) === "rating"
          : true,
      ).length,
    0,
  );

  const activeEvaluationCard =
    evaluationCards.find(
      (card) => card.key === activeEvaluationKey && card.state === "open",
    ) ?? null;

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

  const getEvaluationSubmissionId = (card: EvaluationCard) =>
    [
      student?.studentNumber || student?.id || "student",
      card.instructorId || card.key,
      currentAcademicYear,
      currentSemester,
      card.subjects.map((subject) => subject.id).sort().join("_"),
    ]
      .join("-")
      .replace(/\s+/g, "_");

  const handleMenuClick = () => {
    setSidebarOpen((previousValue) => !previousValue);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleLogout = () => {};

  const handleStartEvaluation = (cardKey: string) => {
    setActiveEvaluationKey(cardKey);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToEvaluations = () => {
    setActiveEvaluationKey(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSetRating = (
    cardKey: string,
    questionId: string,
    rating: number,
  ) => {
    setEvaluationResponses((previousResponses) => ({
      ...previousResponses,
      [cardKey]: {
        ...(previousResponses[cardKey] ?? {}),
        [questionId]: rating,
      },
    }));
  };

  const handleSetEssayResponse = (
    cardKey: string,
    questionId: string,
    response: string,
  ) => {
    setEvaluationResponses((previousResponses) => ({
      ...previousResponses,
      [cardKey]: {
        ...(previousResponses[cardKey] ?? {}),
        [questionId]: response,
      },
    }));
  };

  const handleSubmitEvaluation = (card: EvaluationCard) => {
    if (!student) {
      return;
    }

    const cardProgress = getCardProgress(card.key);

    if (requiredQuestionnaireItems === 0 || cardProgress.percentage < 100) {
      return;
    }

    const submissionId = getEvaluationSubmissionId(card);
    const submission = {
      id: submissionId,
      instructorId: card.instructorId || card.key,
      instructorName: card.instructorName,
      studentNumber: student.studentNumber || student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      yearLevel: student.yearLevel,
      section: student.section || "Unassigned",
      academicYear: currentAcademicYear,
      semester: currentSemester,
      subjectIds: card.subjects.map((subject) => subject.id),
      subjectCodes: card.subjects.map((subject) => subject.code),
      responses: evaluationResponses[card.key] ?? {},
      submittedAt: new Date().toISOString(),
    };

    saveInstructorEvaluationSubmission(student.branch, submission);
    setSubmittedEvaluationIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(submissionId);
      return nextIds;
    });
    setActiveEvaluationKey(null);
    void saveInstructorEvaluationSubmissionToBackend(
      student.branch,
      submission,
    ).catch((error) => {
      console.warn("Failed to sync evaluation submission to Supabase.", error);
    });
  };

  const getCardProgress = (cardKey: string) => {
    const activeQuestionIds = new Set(
      evaluationQuestionnaire.flatMap((category) =>
        category.questions
          .filter((question) =>
            hasRatingQuestionnaireItems
              ? getQuestionType(question) === "rating"
              : true,
          )
          .map((question) => question.id),
      ),
    );
    const answeredCount = Object.entries(evaluationResponses[cardKey] ?? {}).filter(
      ([questionId, response]) =>
        activeQuestionIds.has(questionId) &&
        (typeof response === "number" || response.trim().length > 0),
    ).length;
    const totalCount = requiredQuestionnaireItems;

    return {
      answeredCount,
      totalCount,
      percentage:
        totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0,
    };
  };

  if (isLoading && !student) {
    return (
      <StudentLoadingShell
        activePage="evaluation"
        currentDate={currentDate}
        headerTitle="Evaluation"
        onLogout={handleLogout}
        onMenuClick={handleMenuClick}
        onSidebarClose={handleSidebarClose}
        skeletonTitle="Evaluation"
        studentData={studentData}
        variant="table"
        sidebarOpen={sidebarOpen}
      />
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
          {activeEvaluationCard ? (
            <section className="s-evaluation-detail-page">
              {(() => {
                const card = activeEvaluationCard;
                const cardProgress = getCardProgress(card.key);
                const isSubmitted = submittedEvaluationIds.has(
                  getEvaluationSubmissionId(card),
                );

                return (
                  <>
                    <div className="s-evaluation-detail-header">
                      <button
                        type="button"
                        className="s-evaluation-back-btn"
                        onClick={handleBackToEvaluations}
                      >
                        <FaArrowLeft />
                        Back
                      </button>
                      <div className="s-evaluation-detail-title">
                        <span>Instructor Evaluation</span>
                        <h1>{card.instructorName}</h1>
                        <p>
                          {currentAcademicYear} - {currentSemester}
                        </p>
                      </div>
                    </div>

                    <div className="s-evaluation-detail-meta">
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
                      <div className="s-evaluation-progress">
                        <div className="s-evaluation-progress-head">
                          <span>Evaluation progress</span>
                          <strong>
                            {cardProgress.answeredCount}/
                            {cardProgress.totalCount} answered
                          </strong>
                        </div>
                        <div
                          className="s-evaluation-progress-track"
                          aria-label={`${cardProgress.percentage}% complete`}
                        >
                          <span
                            style={{ width: `${cardProgress.percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="s-evaluation-form-page-panel">
                      <div className="s-evaluation-placeholder-head">
                        <strong>Rating Legend</strong>
                        <span>
                          5 = Strongly Agree, 4 = Agree, 3 = Uncertain, 2 =
                          Disagree, 1 = Strongly Disagree
                        </span>
                      </div>

                      {evaluationQuestionnaire.length > 0 &&
                      totalQuestionnaireItems > 0 ? (
                        <div className="s-evaluation-questionnaire">
                          {evaluationQuestionnaire.map((category) => (
                            <section
                              key={`${card.key}-${category.id}`}
                              className="s-evaluation-category"
                            >
                              <h4>{category.name}</h4>
                              {category.questions.some(
                                (question) => getQuestionType(question) === "rating",
                              ) ? (
                                <div className="s-evaluation-rating-table">
                                  <div className="s-evaluation-rating-row heading">
                                    <strong>Questions</strong>
                                    {[5, 4, 3, 2, 1].map((rating) => (
                                      <strong key={rating}>{rating}</strong>
                                    ))}
                                  </div>

                                  {category.questions
                                    .filter(
                                      (question) =>
                                        getQuestionType(question) === "rating",
                                    )
                                    .map((question) => (
                                      <div
                                        key={`${card.key}-${question.id}`}
                                        className="s-evaluation-rating-row"
                                      >
                                        <span>{question.text}</span>
                                        {[5, 4, 3, 2, 1].map((rating) => (
                                          <label
                                            key={rating}
                                            className="s-evaluation-radio-cell"
                                          >
                                            <input
                                              type="radio"
                                              name={`${card.key}-${question.id}`}
                                              checked={
                                                evaluationResponses[card.key]?.[
                                                  question.id
                                                ] === rating
                                              }
                                              onChange={() =>
                                                handleSetRating(
                                                  card.key,
                                                  question.id,
                                                  rating,
                                                )
                                              }
                                              aria-label={`${rating} for ${question.text}`}
                                            />
                                          </label>
                                        ))}
                                      </div>
                                    ))}
                                </div>
                              ) : null}

                              {category.questions
                                .filter(
                                  (question) =>
                                    getQuestionType(question) === "essay",
                                )
                                .map((question) => (
                                  <label
                                    key={`${card.key}-${question.id}`}
                                    className="s-evaluation-essay-field"
                                  >
                                    <span>{question.text}</span>
                                    <textarea
                                      value={String(
                                        evaluationResponses[card.key]?.[
                                          question.id
                                        ] ?? "",
                                      )}
                                      onChange={(event) =>
                                        handleSetEssayResponse(
                                          card.key,
                                          question.id,
                                          event.target.value,
                                        )
                                      }
                                      rows={4}
                                    />
                                  </label>
                                ))}
                            </section>
                          ))}
                        </div>
                      ) : (
                        <div className="s-evaluation-no-questionnaire">
                          The evaluation questionnaire has not been configured
                          yet.
                        </div>
                      )}

                      <div className="s-evaluation-form-footer">
                        <span>{cardProgress.percentage}% complete</span>
                        <button
                          type="button"
                          onClick={() => handleSubmitEvaluation(card)}
                          disabled={
                            isSubmitted ||
                            requiredQuestionnaireItems === 0 ||
                            cardProgress.percentage < 100
                          }
                        >
                          {isSubmitted ? "Submitted" : "Submit Evaluation"}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </section>
          ) : (
            <>
              <section className="s-evaluation-hero">
                <div className="s-evaluation-hero-copy">
                  <span className="s-evaluation-kicker">
                    Student to Instructor Evaluation
                  </span>
                  <h1>Evaluation</h1>
                  <p>
                    This page shows which instructor evaluations are currently
                    open for your loaded subjects. Complete each rating item to
                    track your progress before submitting the evaluation.
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
                  <div className="s-summary-value">
                    {closedEvaluationsCount}
                  </div>
                </div>
                <div className="s-summary-card">
                  <h4>Instructor Setup Needed</h4>
                  <div className="s-summary-value">
                    {unavailableEvaluationsCount}
                  </div>
                </div>
              </div>

              {evaluationCards.length > 0 ? (
                <section className="s-evaluation-grid">
                  {evaluationCards.map((card) => {
                    const cardProgress = getCardProgress(card.key);
                    const isSubmitted = submittedEvaluationIds.has(
                      getEvaluationSubmissionId(card),
                    );

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
                          </div>
                          <span
                            className={`s-evaluation-state s-evaluation-state-${card.state}`}
                          >
                            {card.state === "open" ? (
                              <FaLockOpen />
                            ) : (
                              <FaLock />
                            )}
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
                          {isSubmitted
                            ? "Your evaluation for this subject has been submitted."
                            : getEvaluationStateCopy(card.state)}
                        </p>

                        {card.state === "open" && !isSubmitted ? (
                          <>
                            <div className="s-evaluation-progress">
                              <div className="s-evaluation-progress-head">
                                <span>Evaluation progress</span>
                                <strong>
                                  {cardProgress.answeredCount}/
                                  {cardProgress.totalCount} answered
                                </strong>
                              </div>
                              <div
                                className="s-evaluation-progress-track"
                                aria-label={`${cardProgress.percentage}% complete`}
                              >
                                <span
                                  style={{
                                    width: `${cardProgress.percentage}%`,
                                  }}
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              className="s-evaluation-action"
                              onClick={() => handleStartEvaluation(card.key)}
                            >
                              <FaClipboardList />
                              Evaluate Instructor
                            </button>
                          </>
                        ) : null}
                        {isSubmitted ? (
                          <div className="s-evaluation-submitted">
                            <FaCheckCircle />
                            Submitted
                          </div>
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default StudentEvaluation;
