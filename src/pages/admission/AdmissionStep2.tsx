import React, { useEffect, useState, useRef } from "react";
import Progress from "../../components/Progress";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";

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
  const [program, setProgram] = useState("Program");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Strand/Course second dropdown menu
  const [menuOpen1, setIsMenuOpen1] = useState(false);
  const [program1, setProgram1] = useState("Strand/Course");
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

  const sexOptions = ["Male", "Female"];
  const civilStatusOptions = ["Single", "Married", "Widowed", "Separated"];

  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Honor options
  const honorOptions = [
    "No Honor",
    "With Honor (50%)",
    "High Honor (60%)",
    "Highest Honor (80%)",
  ];

  let availablePrograms: string[] = [];

  if (studentStatus === "Junior High Completer") {
    availablePrograms = ["Senior High School"];
  } else if (studentStatus === "Senior High Graduate") {
    availablePrograms =
      selectedBranch.toLowerCase() === "bacoor" ? ["College"] : [];
  } else if (studentStatus === "Transferee") {
    availablePrograms =
      selectedBranch.toLowerCase() === "bacoor"
        ? ["College", "Senior High School"]
        : ["Senior High School"];
  } else {
    availablePrograms =
      selectedBranch.toLowerCase() === "bacoor"
        ? ["College", "Senior High School"]
        : ["Senior High School"];
  }

  const strandOptions: Record<string, string[]> = {
    College: ["BSE - Bachelor of Entrepreneurship"],
    "Senior High School": [
      "ABM - Accountancy, Business, and Management",
      "HUMSS - Humanities and Social Sciences",
      "GAS - General Academic Strand",
      "ICT - Information and Communications Technology",
      "IA - Industrial Arts",
    ],
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

  // Form validation
  const isFormValid = (): boolean => {
    if (program === "Program" || program1 === "Strand/Course") return false;
    if (sex === "Sex") return false;
    if (civilStatus === "Civil Status") return false;

    const requiredFields = [
      "fname",
      "lname",
      "address",
      "email",
      "contact",
      "lastSchool",
      "yearCompletion",
    ];

    return requiredFields.every((id) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      return el && el.value.trim() !== "";
    });
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
      if (draft.sex) setSex(draft.sex);
      if (draft.civil_status) setCivilStatus(draft.civil_status);
      if (draft.trackingNumber) setTrackingNumber(draft.trackingNumber);
      if (draft.honor) setHonor(draft.honor);
      if (draft.apply_scholarship !== undefined)
        setApplyScholarship(draft.apply_scholarship);
      if (draft.program) {
        setProgram(draft.program);
        if (draft.strand_or_course) {
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
      addToast("Please complete all required fields.", "error");
      return;
    }

    setIsSubmitting(true);
    saveDraft();

    const payload = {
      tracking_number: trackingNumber || initialTrackingNumber,
      first_name: fname,
      last_name: lname,
      middle_name: mname,
      sex,
      civil_status: civilStatus,
      address: address,
      email: email,
      contact: contact,
      last_school_attended: lastSchool,
      year_completion: yearCompletion,
      program,
      strand_or_course: program1,
      branch: selectedBranch,
      student_status: studentStatus,
      honor,
      apply_scholarship: applyScholarship,
    };

    try {
      const response = await fetch("/api/admissions/step2/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await response.text();
      let data: {
        errors?: unknown;
        tracking_number?: string;
        detail?: string;
      } = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { detail: raw };
        }
      }

      if (!response.ok) {
        const errorMessage =
          typeof data.errors === "string"
            ? data.errors
            : JSON.stringify(data.errors || data, null, 2);
        addToast(`Validation error: ${errorMessage}`, "error");
        setIsSubmitting(false);
        return;
      }

      const nextTrackingNumber =
        data.tracking_number || trackingNumber || initialTrackingNumber;

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
          mname,
          address,
          email,
          contact,
          lastSchool,
          yearCompletion,
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
        "Cannot connect to server. Please check your connection.",
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
      setProgram("Program");
      addToast(
        "College programs are only available at Bacoor branch.",
        "warning",
      );
    }
  }, [program, selectedBranch]);

  useEffect(() => {
    setProgram1("Strand/Course");
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
    return <div className="container">Loading saved data...</div>;
  }

  const isCollege = program === "College";

  return (
    <div className="container">
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
                {selectedBranch || "—"}
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
                  required
                  value={fname}
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
                  required
                  value={lname}
                  onChange={handleInputChange}
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
            </div>

            {/* Sex & Civil Status */}
            <div className="form-row">
              <div className="dropdown" ref={wrapperRefSex}>
                <label>
                  Sex <span style={{ color: "red" }}>*</span>
                </label>
                <div
                  className="select"
                  onClick={() => setIsMenuOpenSex((p) => !p)}
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
                  className="select"
                  onClick={() => setIsMenuOpenCS((p) => !p)}
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
                  className="address-input"
                  type="text"
                  id="address"
                  placeholder="Street Address, City, Province, ZIP Code"
                  required
                  value={address}
                  onChange={handleInputChange}
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
                  placeholder="example@email.com"
                  required
                  value={email}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="contact">
                  Contact <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="tel"
                  id="contact"
                  placeholder="0912 345 6789"
                  required
                  value={contact}
                  onChange={handleInputChange}
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
                  required
                  value={lastSchool}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="yearCompletion">
                  Year Completion <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="text"
                  id="yearCompletion"
                  placeholder="YYYY"
                  required
                  value={yearCompletion}
                  onChange={handleInputChange}
                  maxLength={4}
                />
              </div>
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
                      You will be scheduled for an on-site scholarship exam
                      after approval.
                    </small>
                  )}
                </div>
              </div>
            )}

            {/* Program & Strand */}
            <div className="form-row dropdown-row">
              <div className="dropdown" ref={wrapperRef}>
                <label>
                  Program selection <span style={{ color: "red" }}>*</span>
                </label>
                <div
                  className="select"
                  onClick={() => setIsMenuOpen((p) => !p)}
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
                  Strand / Course selection{" "}
                  <span style={{ color: "red" }}>*</span>
                </label>
                <div
                  className="select"
                  onClick={() => setIsMenuOpen1((p) => !p)}
                >
                  <span className="selected">{program1}</span>
                  <div
                    className={`cart ${menuOpen1 ? "cart-rotate" : ""}`}
                  ></div>
                </div>
                <ul className={`menu ${menuOpen1 ? "show" : ""}`}>
                  {(strandOptions[program] || []).map((opt) => (
                    <li
                      key={opt}
                      onClick={() => {
                        setProgram1(opt);
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
                className={`btn4 ${!isFormValid() || isSubmitting ? "disabled" : ""}`}
                onClick={handleContinue}
                disabled={!isFormValid() || isSubmitting}
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
