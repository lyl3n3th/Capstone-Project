import React, { useEffect, useState, useRef } from "react";
import Progress from "../../components/Progress";
import { ToastContainer } from "../../components/common/Toast";
import SkeletonPage from "../../components/common/SkeletonPage";
import "../../styles/main.css";
import {
  civilStatusOptions,
  getAdmissionBranchName,
  getAdmissionYearLevelOptions,
  getAvailablePrograms,
  normalizeAdmissionYearLevel,
  getTrackOptions,
  honorOptions,
  saveAdmissionApplication,
  sexOptions,
} from "../../services/admission";

const EDUCATIONAL_LEVEL_PLACEHOLDER = "Educational Level";
const TRACK_SELECTION_PLACEHOLDER = "Strand / Program";
const LEGACY_LEVEL_PLACEHOLDER = "Program";
const LEGACY_TRACK_PLACEHOLDER = "Strand/Course";
const YEAR_LEVEL_PLACEHOLDER = "Select year level";

const isEducationalLevelPlaceholder = (value: string) =>
  value === EDUCATIONAL_LEVEL_PLACEHOLDER || value === LEGACY_LEVEL_PLACEHOLDER;

const isTrackSelectionPlaceholder = (value: string) =>
  value === TRACK_SELECTION_PLACEHOLDER || value === LEGACY_TRACK_PLACEHOLDER;

const REQUIRED_FIELD_IDS = [
  "fname",
  "lname",
  "address",
  "email",
  "contact",
  "lastSchool",
] as const;

type RequiredFieldId = (typeof REQUIRED_FIELD_IDS)[number];
type PersonalInfoFieldId = RequiredFieldId | "yearCompletion";
type FormFieldId =
  | PersonalInfoFieldId
  | "program"
  | "program1"
  | "sex"
  | "civilStatus"
  | "requestedYearLevel";

// get query
function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

function AdmissionStep2() {
  const initialTrackingNumber = getQueryParam("trackingNumber") || "";

  // Program dropdown menu
  const [menuOpen, setIsMenuOpen] = useState(false);
  const [program, setProgram] = useState(EDUCATIONAL_LEVEL_PLACEHOLDER);
  const [requestedYearLevel, setRequestedYearLevel] = useState(
    YEAR_LEVEL_PLACEHOLDER,
  );
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Strand/Course second dropdown menu
  const [menuOpen1, setIsMenuOpen1] = useState(false);
  const [program1, setProgram1] = useState(TRACK_SELECTION_PLACEHOLDER);
  const wrapperRef1 = useRef<HTMLDivElement>(null);

  // Civil Drop down
  const [menuOpenCS, setIsMenuOpenCS] = useState(false);
  const [civilStatus, setCivilStatus] = useState("Civil Status");
  const wrapperRefCS = useRef<HTMLDivElement>(null);

  // Sex drop down
  const [menuOpenSex, setIsMenuOpenSex] = useState(false);
  const [sex, setSex] = useState("Sex");
  const wrapperRefSex = useRef<HTMLDivElement>(null);

  // Honor dropdown
  const [menuOpenHonor, setIsMenuOpenHonor] = useState(false);
  const [honor, setHonor] = useState("Select Honor");
  const wrapperRefHonor = useRef<HTMLDivElement>(null);

  // Scholarship Exam Option
  const [applyScholarship, setApplyScholarship] = useState(false);

  // submit handle
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [touchedFields, setTouchedFields] = useState<
    Partial<Record<FormFieldId, boolean>>
  >({});

  // info states (KEPT)
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [mname, setMname] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [lastSchool, setLastSchool] = useState("");
  const [yearCompletion, setYearCompletion] = useState("");

  const [trackingNumber, setTrackingNumber] = useState(initialTrackingNumber);

  // draft
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  // branch admission data
  const selectedBranch = getQueryParam("branch") || "";
  const studentStatus = getQueryParam("status") || "";
  const fromRequirements = getQueryParam("from") === "requirements";

  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const availablePrograms = getAvailablePrograms(selectedBranch, studentStatus);
  const trackOptions = getTrackOptions(program);
  const isTransferee = studentStatus === "Transferee";
  const yearLevelOptions = getAdmissionYearLevelOptions(program);
  const needsRequestedYearLevel = isTransferee && yearLevelOptions.length > 0;
  const trackSelectionLabel =
    program === "College"
      ? "Program selection"
      : program === "Senior High School"
        ? "Strand selection"
        : "Strand / Program selection";

  const getFieldValue = (fieldId: PersonalInfoFieldId) => {
    switch (fieldId) {
      case "fname":
        return fname;
      case "lname":
        return lname;
      case "address":
        return address;
      case "email":
        return email;
      case "contact":
        return contact;
      case "lastSchool":
        return lastSchool;
      case "yearCompletion":
        return yearCompletion;
    }
  };

  const getFieldError = (fieldId: FormFieldId): string => {
    if (fieldId === "program") {
      return isEducationalLevelPlaceholder(program)
        ? "Educational level is required."
        : "";
    }

    if (fieldId === "program1") {
      return isTrackSelectionPlaceholder(program1)
        ? `${trackSelectionLabel} is required.`
        : "";
    }

    if (fieldId === "sex") {
      return sex === "Sex" ? "Sex is required." : "";
    }

    if (fieldId === "civilStatus") {
      return civilStatus === "Civil Status" ? "Civil status is required." : "";
    }

    if (fieldId === "requestedYearLevel") {
      return needsRequestedYearLevel &&
        !normalizeAdmissionYearLevel(program, requestedYearLevel)
        ? "Current year level is required."
        : "";
    }

    if (fieldId === "yearCompletion" && isTransferee) {
      return "";
    }

    const value = getFieldValue(fieldId).trim();

    if (!value) {
      return "This field is required.";
    }

    if (fieldId === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return "Enter a valid email address.";
    }

    if (fieldId === "contact" && value.replace(/\D/g, "").length !== 11) {
      return "Enter an 11-digit contact number.";
    }

    if (
      fieldId === "yearCompletion" &&
      (!/^\d{4}$/.test(value) ||
        Number(value) < 1900 ||
        Number(value) > new Date().getFullYear())
    ) {
      return "Enter a valid 4-digit year.";
    }

    return "";
  };

  const shouldShowFieldError = (fieldId: FormFieldId) =>
    Boolean(
      getFieldError(fieldId) && (showValidationErrors || touchedFields[fieldId]),
    );

  const getInputClassName = (
    fieldId: FormFieldId,
    baseClassName = "",
  ) =>
    [baseClassName, shouldShowFieldError(fieldId) ? "input-error" : ""]
      .filter(Boolean)
      .join(" ");

  const markFieldTouched = (fieldId: FormFieldId) => {
    setTouchedFields((prev) => ({ ...prev, [fieldId]: true }));
  };

  // Format contact number (adds space after 4th and 7th digits)
  const formatContactNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 4 && cleaned.length < 7) {
      return cleaned.slice(0, 4) + " " + cleaned.slice(4);
    } else if (cleaned.length >= 7) {
      return (
        cleaned.slice(0, 4) +
        " " +
        cleaned.slice(4, 7) +
        " " +
        cleaned.slice(7, 11)
      );
    }
    return cleaned;
  };

  // Handle contact input with auto-formatting
  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const numbersOnly = rawValue.replace(/\s/g, "");
    if (/^\d*$/.test(numbersOnly)) {
      const formatted = formatContactNumber(numbersOnly);
      setContact(formatted);
    }
  };

  // Handle year completion (only numbers)
  const handleYearCompletionChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 4) {
      setYearCompletion(value);
    }
  };

  const getFieldsToValidate = (): FormFieldId[] => {
    const fieldsToValidate: FormFieldId[] = [
      ...REQUIRED_FIELD_IDS,
      "program",
      "program1",
      "sex",
      "civilStatus",
    ];

    if (!isTransferee) {
      fieldsToValidate.push("yearCompletion");
    }

    if (needsRequestedYearLevel) {
      fieldsToValidate.push("requestedYearLevel");
    }

    return fieldsToValidate;
  };

  // Form validation
  const isFormValid = (): boolean => {
    const fieldsToValidate = getFieldsToValidate();

    return fieldsToValidate.every((fieldId) => !getFieldError(fieldId));
  };

  // Save draft to sessionStorage
  const saveDraft = () => {
    const draftData = {
      step: 2,
      trackingNumber,
      branch: selectedBranch,
      status: studentStatus,
      timestamp: new Date().toISOString(),
      fname,
      lname,
      middle_name: mname,
      address,
      email,
      contact,
      last_school_attended: lastSchool,
      year_completion: yearCompletion,
      requested_year_level:
        normalizeAdmissionYearLevel(program, requestedYearLevel) || undefined,
      program,
      strand_or_course: program1,
      sex,
      civil_status: civilStatus,
      honor,
      apply_scholarship: applyScholarship,
    };
    sessionStorage.setItem("enrollmentDraft", JSON.stringify(draftData));
  };

  // Load draft from sessionStorage
  const loadDraft = () => {
    const saved = sessionStorage.getItem("enrollmentDraft");
    if (!saved) {
      setIsLoadingDraft(false);
      return;
    }

    try {
      const draft = JSON.parse(saved);
      if (draft.branch !== selectedBranch || draft.status !== studentStatus) {
        sessionStorage.removeItem("enrollmentDraft");
        setIsLoadingDraft(false);
        return;
      }

      if (draft.fname) setFname(draft.fname);
      if (draft.lname) setLname(draft.lname);
      if (draft.middle_name) setMname(draft.middle_name);
      if (draft.address) setAddress(draft.address);
      if (draft.email) setEmail(draft.email);
      if (draft.contact) setContact(draft.contact);
      if (draft.last_school_attended) setLastSchool(draft.last_school_attended);
      if (draft.year_completion) setYearCompletion(draft.year_completion);
      if (draft.requested_year_level || draft.requestedYearLevel) {
        setRequestedYearLevel(
          draft.requested_year_level || draft.requestedYearLevel,
        );
      }
      if (draft.sex) setSex(draft.sex);
      if (draft.civil_status) setCivilStatus(draft.civil_status);
      if (draft.trackingNumber) setTrackingNumber(draft.trackingNumber);
      if (draft.honor) setHonor(draft.honor);
      if (draft.apply_scholarship !== undefined)
        setApplyScholarship(draft.apply_scholarship);
      if (draft.program && !isEducationalLevelPlaceholder(draft.program)) {
        setProgram(draft.program);
        if (
          draft.strand_or_course &&
          !isTrackSelectionPlaceholder(draft.strand_or_course)
        ) {
          setTimeout(() => {
            setProgram1(draft.strand_or_course);
          }, 100);
        }
      }
    } catch (err) {
      console.warn("Failed to load draft", err);
    } finally {
      setIsLoadingDraft(false);
    }
  };

  useEffect(() => {
    if (fromRequirements) {
      loadDraft();
    }
  }, [fromRequirements]);

  // Auto-save draft
  useEffect(() => {
    if (!isLoadingDraft) {
      const timeoutId = setTimeout(() => {
        saveDraft();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [
    fname,
    lname,
    mname,
    address,
    email,
    contact,
    lastSchool,
    yearCompletion,
    requestedYearLevel,
    program,
    program1,
    sex,
    civilStatus,
    honor,
    applyScholarship,
    trackingNumber,
  ]);

  useEffect(() => {
    loadDraft();
  }, []);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    switch (id) {
      case "fname":
        setFname(value);
        break;
      case "lname":
        setLname(value);
        break;
      case "mname":
        setMname(value);
        break;
      case "address":
        setAddress(value);
        break;
      case "email":
        setEmail(value);
        break;
      case "contact":
        handleContactChange(e);
        break;
      case "lastSchool":
        setLastSchool(value);
        break;
      case "yearCompletion":
        handleYearCompletionChange(e);
        break;
    }
  };

  const handleContinue = async () => {
    if (!isFormValid()) {
      const invalidFields = getFieldsToValidate().filter((fieldId) =>
        getFieldError(fieldId),
      );
      setShowValidationErrors(true);
      setTouchedFields((prev) => ({
        ...prev,
        ...Object.fromEntries(invalidFields.map((fieldId) => [fieldId, true])),
      }));
      addToast("Please correct the highlighted fields.", "error");
      return;
    }

    setIsSubmitting(true);
    saveDraft();

    try {
      const savedApplication = await saveAdmissionApplication({
        trackingNumber: trackingNumber || initialTrackingNumber,
        branchCode: selectedBranch,
        studentStatus,
        programName: program,
        trackName: program1,
        firstName: fname,
        lastName: lname,
        middleName: mname,
        sex,
        civilStatus,
        address,
        email,
        phoneNumber: contact,
        lastSchoolAttended: lastSchool,
        yearCompletion: isTransferee ? "" : yearCompletion,
        requestedYearLevel:
          normalizeAdmissionYearLevel(program, requestedYearLevel) || undefined,
        honorLabel: honor === "Select Honor" ? "No Honor" : honor,
        applyScholarship,
        currentStep: 2,
        applicationStatus: "draft",
      });

      const nextTrackingNumber = savedApplication.trackingNumber;

      if (nextTrackingNumber) {
        setTrackingNumber(nextTrackingNumber);
        const currentDraft = JSON.parse(
          sessionStorage.getItem("enrollmentDraft") || "{}",
        );
        const updatedDraft = {
          ...currentDraft,
          trackingNumber: nextTrackingNumber,
          step: 2.5,
          timestamp: new Date().toISOString(),
          fname,
          lname,
          middle_name: mname,
          address,
          email,
          contact,
          last_school_attended: lastSchool,
          year_completion: isTransferee ? "" : yearCompletion,
          requested_year_level:
            normalizeAdmissionYearLevel(program, requestedYearLevel) ||
            undefined,
          program,
          strand_or_course: program1,
          sex,
          civil_status: civilStatus,
          honor,
          apply_scholarship: applyScholarship,
          branch: selectedBranch,
          status: studentStatus,
        };
        sessionStorage.setItem("enrollmentDraft", JSON.stringify(updatedDraft));
        addToast("Application saved successfully!", "success");
      }

      window.location.href = `/requirements?branch=${encodeURIComponent(selectedBranch)}&status=${encodeURIComponent(studentStatus)}&trackingNumber=${nextTrackingNumber}&program=${encodeURIComponent(program)}`;
    } catch (err) {
      console.error(err);
      addToast(
        err instanceof Error
          ? err.message
          : "Cannot connect to Supabase right now. Please try again.",
        "error",
      );
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    saveDraft();
    addToast("Returning to enrollment page", "info");
    setTimeout(() => {
      window.location.href = `/enroll?from=information`;
    }, 300);
  };

  // Reset if non-bacoor
  useEffect(() => {
    if (program === "College" && selectedBranch.toLowerCase() !== "bacoor") {
      setProgram(EDUCATIONAL_LEVEL_PLACEHOLDER);
      addToast(
        "College programs are only available at Bacoor branch.",
        "warning",
      );
    }
  }, [program, selectedBranch]);

  useEffect(() => {
    setProgram1(TRACK_SELECTION_PLACEHOLDER);
    setRequestedYearLevel(
      (currentYearLevel) =>
        normalizeAdmissionYearLevel(program, currentYearLevel) ||
        YEAR_LEVEL_PLACEHOLDER,
    );
  }, [program]);

  // Close dropdown menus
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      )
        setIsMenuOpen(false);
      if (
        wrapperRef1.current &&
        !wrapperRef1.current.contains(event.target as Node)
      )
        setIsMenuOpen1(false);
      if (
        wrapperRefCS.current &&
        !wrapperRefCS.current.contains(event.target as Node)
      )
        setIsMenuOpenCS(false);
      if (
        wrapperRefSex.current &&
        !wrapperRefSex.current.contains(event.target as Node)
      )
        setIsMenuOpenSex(false);
      if (
        wrapperRefHonor.current &&
        !wrapperRefHonor.current.contains(event.target as Node)
      )
        setIsMenuOpenHonor(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoadingDraft) {
    return (
      <div className="container admission-step2-page">
        <SkeletonPage eyebrow="Admission" title="Saved Data" variant="form" />
      </div>
    );
  }

  const isCollege = program === "College";

  return (
    <div className="container admission-step2-page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1">
        <Progress current={2} />
      </div>

      <div className="mcontainer1">
        <div className="header1">
          <div className="syb">
            Personal Information
            <p>
              Branch selected:{" "}
              <strong style={{ margin: "4px", color: "#1A3D5C" }}>
                {selectedBranch ? getAdmissionBranchName(selectedBranch) : "-"}
              </strong>
              <br />
            </p>
            <p>Please fill in all the required fields. </p>
          </div>

          <form action="" className="pinfo">
            {/* Name Row */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="fname">
                  First Name <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="text"
                  id="fname"
                  className={getInputClassName("fname")}
                  required
                  value={fname}
                  onChange={handleInputChange}
                  onBlur={() => markFieldTouched("fname")}
                />
              </div>
              <div className="form-group">
                <label htmlFor="mname">Middle Name</label>
                <input
                  type="text"
                  id="mname"
                  value={mname}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="lname">
                  Last Name <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="text"
                  id="lname"
                  className={getInputClassName("lname")}
                  required
                  value={lname}
                  onChange={handleInputChange}
                  onBlur={() => markFieldTouched("lname")}
                />
              </div>
            </div>

            {/* Sex & Civil Status */}
            <div className="form-row">
              <div className="dropdown" ref={wrapperRefSex}>
                <label>
                  Sex <span style={{ color: "red" }}>*</span>
                </label>
                <div
                  className={getInputClassName("sex", "select")}
                  onClick={() => setIsMenuOpenSex((p) => !p)}
                  onBlur={() => markFieldTouched("sex")}
                  tabIndex={0}
                >
                  <span className="selected">{sex}</span>
                  <div
                    className={`cart ${menuOpenSex ? "cart-rotate" : ""}`}
                  ></div>
                </div>
                <ul className={`menu ${menuOpenSex ? "show" : ""}`}>
                  {sexOptions.map((opt) => (
                    <li
                      key={opt}
                      onClick={() => {
                        setSex(opt);
                        markFieldTouched("sex");
                        setIsMenuOpenSex(false);
                      }}
                    >
                      {opt}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="dropdown" ref={wrapperRefCS}>
                <label>
                  Civil Status <span style={{ color: "red" }}>*</span>
                </label>
                <div
                  className={getInputClassName("civilStatus", "select")}
                  onClick={() => setIsMenuOpenCS((p) => !p)}
                  onBlur={() => markFieldTouched("civilStatus")}
                  tabIndex={0}
                >
                  <span className="selected">{civilStatus}</span>
                  <div
                    className={`cart ${menuOpenCS ? "cart-rotate" : ""}`}
                  ></div>
                </div>
                <ul className={`menu ${menuOpenCS ? "show" : ""}`}>
                  {civilStatusOptions.map((opt) => (
                    <li
                      key={opt}
                      onClick={() => {
                        setCivilStatus(opt);
                        markFieldTouched("civilStatus");
                        setIsMenuOpenCS(false);
                      }}
                    >
                      {opt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Address */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="address">
                  Address <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  className={getInputClassName("address", "address-input")}
                  type="text"
                  id="address"
                  placeholder="Street Address, City, Province, ZIP Code"
                  required
                  value={address}
                  onChange={handleInputChange}
                  onBlur={() => markFieldTouched("address")}
                />
              </div>
            </div>

            {/* Email & Contact */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">
                  Email <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  className={getInputClassName("email")}
                  placeholder="example@email.com"
                  required
                  value={email}
                  onChange={handleInputChange}
                  onBlur={() => markFieldTouched("email")}
                />
              </div>
              <div className="form-group">
                <label htmlFor="contact">
                  Contact <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="tel"
                  id="contact"
                  className={getInputClassName("contact")}
                  placeholder="0912 345 6789"
                  required
                  value={contact}
                  onChange={handleInputChange}
                  onBlur={() => markFieldTouched("contact")}
                  maxLength={13}
                />
              </div>
            </div>

            {/* School Info */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="lastSchool">
                  Last School Attended <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="text"
                  id="lastSchool"
                  className={getInputClassName("lastSchool")}
                  required
                  value={lastSchool}
                  onChange={handleInputChange}
                  onBlur={() => markFieldTouched("lastSchool")}
                />
              </div>
              {!isTransferee && (
                <div className="form-group">
                  <label htmlFor="yearCompletion">
                    Year Completion <span style={{ color: "red" }}>*</span>
                  </label>
                  <input
                    type="text"
                    id="yearCompletion"
                    className={getInputClassName("yearCompletion")}
                    placeholder="YYYY"
                    required
                    value={yearCompletion}
                    onChange={handleInputChange}
                    onBlur={() => markFieldTouched("yearCompletion")}
                    maxLength={4}
                  />
                </div>
              )}
            </div>

            {/* Honor & Scholarship - Only shows for COLLEGE */}
            {isCollege && (
              <div className="form-row honor-scholarship-row">
                <div className="form-group honor-group">
                  <label>Academic Honor (if applicable)</label>
                  <div className="dropdown" ref={wrapperRefHonor}>
                    <div
                      className="select"
                      onClick={() => setIsMenuOpenHonor((p) => !p)}
                    >
                      <span className="selected">{honor}</span>
                      <div
                        className={`cart ${menuOpenHonor ? "cart-rotate" : ""}`}
                      ></div>
                    </div>
                    <ul className={`menu-honor ${menuOpenHonor ? "show" : ""}`}>
                      {honorOptions.map((opt) => (
                        <li
                          key={opt}
                          onClick={() => {
                            setHonor(opt);
                            setIsMenuOpenHonor(false);
                            saveDraft();
                          }}
                        >
                          {opt}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="form-group scholarship-group">
                  <label>Scholarship Exam</label>
                  <div className="scholarship-options">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="scholarship"
                        checked={applyScholarship === true}
                        onChange={() => setApplyScholarship(true)}
                      />
                      <span>Apply for Scholarship</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="scholarship"
                        checked={applyScholarship === false}
                        onChange={() => setApplyScholarship(false)}
                      />
                      <span>Regular Enrollment</span>
                    </label>
                  </div>
                  {applyScholarship && (
                    <small className="scholarship-note">
                      Scholarship exams are taken on-site after approval.
                      There is no fixed schedule, so please coordinate with
                      your selected branch before visiting.
                    </small>
                  )}
                </div>
              </div>
            )}

            {/* Program & Strand */}
            <div className="form-row dropdown-row">
              <div className="dropdown" ref={wrapperRef}>
                <label>
                  Educational Level <span style={{ color: "red" }}>*</span>
                </label>
                <div
                  className={getInputClassName("program", "select")}
                  onClick={() => setIsMenuOpen((p) => !p)}
                  onBlur={() => markFieldTouched("program")}
                  tabIndex={0}
                >
                  <span className="selected">{program}</span>
                  <div
                    className={`cart ${menuOpen ? "cart-rotate" : ""}`}
                  ></div>
                </div>
                <ul className={`menu ${menuOpen ? "show" : ""}`}>
                  {availablePrograms.length > 0 ? (
                    availablePrograms.map((opt) => (
                      <li
                        key={opt}
                        onClick={() => {
                          setProgram(opt);
                          markFieldTouched("program");
                          setIsMenuOpen(false);
                        }}
                      >
                        {opt}
                      </li>
                    ))
                  ) : (
                    <li className="disabled">
                      No programs available for this branch/status
                    </li>
                  )}
                </ul>
              </div>

              <div className="dropdown" ref={wrapperRef1}>
                <label>
                  {trackSelectionLabel}{" "}
                  <span style={{ color: "red" }}>*</span>
                </label>
                <div
                  className={getInputClassName("program1", "select")}
                  onClick={() => setIsMenuOpen1((p) => !p)}
                  onBlur={() => markFieldTouched("program1")}
                  tabIndex={0}
                >
                  <span className="selected">{program1}</span>
                  <div
                    className={`cart ${menuOpen1 ? "cart-rotate" : ""}`}
                  ></div>
                </div>
                <ul className={`menu ${menuOpen1 ? "show" : ""}`}>
                  {trackOptions.map((opt) => (
                    <li
                      key={opt}
                      onClick={() => {
                        setProgram1(opt);
                        markFieldTouched("program1");
                        setIsMenuOpen1(false);
                        saveDraft();
                      }}
                    >
                      {opt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {needsRequestedYearLevel && (
              <div className="form-row">
                <div className="form-group transferee-year-level-field">
                  <label htmlFor="requestedYearLevel">
                    Current Year Level <span style={{ color: "red" }}>*</span>
                  </label>
                  <select
                    id="requestedYearLevel"
                    className={getInputClassName("requestedYearLevel")}
                    required
                    value={
                      normalizeAdmissionYearLevel(program, requestedYearLevel) ||
                      ""
                    }
                    onChange={(event) => {
                      setRequestedYearLevel(event.target.value);
                      markFieldTouched("requestedYearLevel");
                    }}
                    onBlur={() => markFieldTouched("requestedYearLevel")}
                  >
                    <option value="" disabled>
                      {YEAR_LEVEL_PLACEHOLDER}
                    </option>
                    {yearLevelOptions.map((yearLevel) => (
                      <option key={yearLevel} value={yearLevel}>
                        {yearLevel}
                      </option>
                    ))}
                  </select>
                  <small className="transferee-year-level-note">
                    Choose the year level you already reached before
                    transferring so the registrar can evaluate your TOR against
                    the right curriculum.
                  </small>
                </div>
              </div>
            )}

            <div className="choices3">
              <button
                type="button"
                className="btn3"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn4 ${isSubmitting ? "disabled" : ""}`}
                onClick={handleContinue}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Continue"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdmissionStep2;
