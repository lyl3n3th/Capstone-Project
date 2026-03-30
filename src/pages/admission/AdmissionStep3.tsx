import { MdOutlineDriveFolderUpload } from "react-icons/md";
import { FaCircleExclamation } from "react-icons/fa6";
import "../../styles/main.css";
import Progress from "../../components/Progress";
import React, { useState, useEffect } from "react";
import { MdOutlineAttachFile } from "react-icons/md";
import { ToastContainer } from "../../components/common/Toast";

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

function AdmissionStep3() {
  const selectedBranch = getQueryParam("branch") || "";
  const studentStatus = getQueryParam("status") || "";
  const trackingNumber = getQueryParam("trackingNumber") || "";
  const program = getQueryParam("program") || "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>(
    {},
  );
  const [toasts, setToasts] = useState<Toast[]>([]);

  // State for honor selection from draft
  const [studentHonor, setStudentHonor] = useState<string>("No Honor");
  const [isCollegeProgram, setIsCollegeProgram] = useState<boolean>(false);

  // Add toast notification
  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  // Remove toast notification
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Load and verify draft data on component mount
  useEffect(() => {
    const draft = sessionStorage.getItem("enrollmentDraft");
    const isCollege = program === "College";
    setIsCollegeProgram(isCollege);

    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        console.log("Draft loaded in requirements page:", {
          fname: parsedDraft.fname,
          lname: parsedDraft.lname,
          program: parsedDraft.program,
          strand: parsedDraft.strand_or_course,
          trackingNumber: parsedDraft.trackingNumber,
          honor: parsedDraft.honor,
          isCollege: isCollege,
        });

        // Only set honor if it's a College program and honor exists
        if (
          isCollege &&
          parsedDraft.honor &&
          parsedDraft.honor !== "No Honor"
        ) {
          setStudentHonor(parsedDraft.honor);
        } else {
          // Reset honor for non-college programs
          setStudentHonor("No Honor");

          // Also update the draft to clear honor if it exists
          if (parsedDraft.honor && !isCollege) {
            const updatedDraft = {
              ...parsedDraft,
              honor: "No Honor",
              apply_scholarship: false,
            };
            sessionStorage.setItem(
              "enrollmentDraft",
              JSON.stringify(updatedDraft),
            );
            console.log("Cleared honor data for non-college program");
          }
        }
      } catch (err) {
        console.warn("Failed to parse draft", err);
      }
    } else {
      // No draft, ensure honor is reset for non-college
      if (!isCollege) {
        setStudentHonor("No Honor");
      }
    }
  }, [program]); // Re-run when program changes

  // Base requirements for all students
  const baseRequirements: Record<string, string[]> = {
    "Junior High Completer": [
      "Form 137",
      "Grade Report Card",
      "Birth Certificate/PSA",
      "Good Moral Character",
    ],
    "Senior High Graduate": [
      "Form 137",
      "Diploma/Certificate of Graduation",
      "Birth Certificate/PSA",
      "Good Moral Character",
    ],
    Transferee: [
      "Transcript of Records (TOR)",
      "Honorable Dismissal",
      "Birth Certificate/PSA",
      "Good Moral Character",
    ],
    "Foreign Student": [
      "Passport",
      "Visa",
      "Birth Certificate/PSA",
      "Good Moral Character",
    ],
    "Cross-Registrant": [
      "Permit to Cross-Register",
      "Current School ID",
      "Birth Certificate/PSA",
      "Good Moral Character",
    ],
  };

  // Check if student has honor (not "No Honor") AND is college program
  const hasHonor = isCollegeProgram && studentHonor !== "No Honor";

  // Get base requirements
  let currentRequirements = [...(baseRequirements[studentStatus] || [])];

  // Add Honor Certificate requirement ONLY if student has honor AND is college program
  if (hasHonor) {
    currentRequirements.push("Honor Certificate");
  }

  // Function to arrange items in rows (2 per row, last row centered)
  const getArrangedRows = () => {
    const rows = [];
    const items = [...currentRequirements];

    for (let i = 0; i < items.length; i += 2) {
      const row = items.slice(i, i + 2);
      rows.push(row);
    }
    return rows;
  };

  const arrangedRows = getArrangedRows();

  // Handle file selection
  const handleFileChange = (
    req: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFiles((prev) => ({
        ...prev,
        [req]: file.name,
      }));
      addToast(`${req} uploaded successfully!`, "success");
    }
  };

  // Function to continue without uploading
  const handleContinueWithoutUpload = () => {
    const existing = sessionStorage.getItem("enrollmentDraft");
    if (existing) {
      const draft = JSON.parse(existing);
      const updated = {
        ...draft,
        step: 3,
        requirementsSkipped: true,
        timestamp: draft.timestamp || new Date().toISOString(),
      };
      sessionStorage.setItem("enrollmentDraft", JSON.stringify(updated));
    }

    addToast("Continuing without uploading requirements", "info");
    setTimeout(() => {
      window.location.href = `/confirmation?branch=${encodeURIComponent(selectedBranch)}&status=${encodeURIComponent(studentStatus)}&trackingNumber=${trackingNumber}&program=${encodeURIComponent(program)}`;
    }, 500);
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if required honor certificate is missing
    if (hasHonor) {
      const honorInput = document.getElementById(
        "honorcertificate",
      ) as HTMLInputElement;
      if (!honorInput?.files?.[0]) {
        addToast(
          "Honor Certificate is required to verify your academic honors.",
          "warning",
        );
        return;
      }
    }

    const hasFiles = currentRequirements.some((req) => {
      const input = document.getElementById(
        req.replace(/\s+/g, "").toLowerCase(),
      ) as HTMLInputElement;
      return input?.files?.[0] != null;
    });

    if (!hasFiles) {
      addToast("No files selected. Continuing without upload.", "info");
      handleContinueWithoutUpload();
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("trackingNumber", trackingNumber);
    formData.append("program", program);
    formData.append("hasHonor", String(hasHonor));

    currentRequirements.forEach((req) => {
      const input = document.getElementById(
        req.replace(/\s+/g, "").toLowerCase(),
      ) as HTMLInputElement;
      if (input?.files?.[0]) {
        formData.append(req, input.files[0]);
      }
    });

    try {
      const response = await fetch("/api/admissions/requirements/", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        addToast("Upload failed. You can continue without uploading.", "error");
        handleContinueWithoutUpload();
        return;
      }

      const data = await response.json();
      console.log("Uploaded:", data);
      addToast("Requirements uploaded successfully!", "success");

      const existing = sessionStorage.getItem("enrollmentDraft");
      if (existing) {
        const draft = JSON.parse(existing);
        const updated = {
          ...draft,
          step: 3,
          requirementsUploaded: true,
          timestamp: draft.timestamp || new Date().toISOString(),
        };
        sessionStorage.setItem("enrollmentDraft", JSON.stringify(updated));
      }

      setTimeout(() => {
        window.location.href = `/confirmation?branch=${encodeURIComponent(selectedBranch)}&status=${encodeURIComponent(studentStatus)}&trackingNumber=${trackingNumber}&program=${encodeURIComponent(program)}`;
      }, 500);
    } catch (err) {
      console.error(err);
      addToast("Server error. Continuing without upload...", "error");
      handleContinueWithoutUpload();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    const existing = sessionStorage.getItem("enrollmentDraft");
    let draft = existing ? JSON.parse(existing) : {};

    console.log("Preserving draft data on cancel:", {
      fname: draft.fname,
      lname: draft.lname,
      program: draft.program,
      strand: draft.strand_or_course,
      honor: draft.honor,
    });

    const updatedDraft = {
      ...draft,
      step: 2,
      lastVisited: new Date().toISOString(),
      branch: selectedBranch,
      status: studentStatus,
      trackingNumber: trackingNumber || draft.trackingNumber,
    };

    sessionStorage.setItem("enrollmentDraft", JSON.stringify(updatedDraft));
    addToast("Returning to information page", "info");
    setTimeout(() => {
      window.location.href = `/information?branch=${encodeURIComponent(selectedBranch)}&status=${encodeURIComponent(studentStatus)}&trackingNumber=${trackingNumber || draft.trackingNumber}&program=${encodeURIComponent(program)}&from=requirements`;
    }, 500);
  };

  // If no requirements for this status
  if (currentRequirements.length === 0) {
    return (
      <div className="container admission-req-container">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="container1">
          <Progress current={3} />
        </div>
        <div className="mcontainer mcnt">
          <div className="header2">
            <div className="syb">
              Upload Requirements
              <p>No requirements found for {studentStatus} status.</p>
            </div>
            <div className="choices2">
              <button className="btn5" onClick={handleCancel}>
                Cancel
              </button>
              <button className="btn6" onClick={handleContinueWithoutUpload}>
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container admission-req-container">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1">
        <Progress current={3} />
      </div>

      <div className="mcontainer mcnt">
        <div className="header2">
          <div className="syb">
            <h2>Upload Requirements</h2>
            <p>Upload the necessary documents to complete your application.</p>
            {hasHonor && (
              <div
                className="honor-notice"
                style={{
                  background: "#e3f2fd",
                  borderLeft: "4px solid #066287",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginTop: "12px",
                }}
              >
                <p style={{ margin: 0, color: "#066287" }}>
                  <strong>Honor Certificate Required</strong>
                </p>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "13px",
                    color: "#066287",
                  }}
                >
                  You indicated: <strong>{studentHonor}</strong>. Please upload
                  your Honor Certificate to verify your academic honors and
                  qualify for tuition discounts.
                </p>
              </div>
            )}
          </div>

          <form className="Upload-form" onSubmit={handleSubmit}>
            {arrangedRows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="upload-row"
                style={{
                  display: "flex",
                  justifyContent: row.length === 1 ? "center" : "flex-start",
                  gap: "30px",
                  marginBottom: "30px",
                  flexWrap: "wrap",
                }}
              >
                {row.map((req, index) => {
                  const inputId = req.replace(/\s+/g, "").toLowerCase();
                  const isHonorCert = req === "Honor Certificate";
                  const hasFile = uploadedFiles[req];
                  return (
                    <div
                      key={index}
                      className="upload-group"
                      style={{
                        flex: row.length === 1 ? "0 1 auto" : "1",
                        minWidth: "280px",
                        maxWidth: row.length === 1 ? "350px" : "100%",
                      }}
                    >
                      <label htmlFor={inputId}>
                        {req}{" "}
                        {isHonorCert && hasHonor && (
                          <span style={{ color: "red", fontSize: "12px" }}>
                            *
                          </span>
                        )}
                        <span style={{ color: "#666", fontSize: "12px" }}>
                          {!isHonorCert && " (optional)"}
                        </span>
                      </label>
                      <label className="file-wrapper">
                        <span className="upload-text">
                          {hasFile ? (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "2px",
                              }}
                            >
                              <MdOutlineAttachFile /> {uploadedFiles[req]}
                            </span>
                          ) : (
                            `Click to upload ${req}${isHonorCert && hasHonor ? " (required)" : " (optional)"}`
                          )}
                        </span>
                        <div className="cont-icon">
                          <MdOutlineDriveFolderUpload className="icon" />
                        </div>
                        <input
                          className="file-input"
                          type="file"
                          id={inputId}
                          name={inputId}
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleFileChange(req, e)}
                          required={isHonorCert && hasHonor}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="choices-note">
              <div className="note-header">
                <FaCircleExclamation className="exclamation-icon" />
                <p className="note">Important Notes:</p>
              </div>

              <p className="notice-text">
                All Documents must be clear and readable
              </p>
              <p className="notice-text">
                Files should be in PDF or image format (JPG, PNG)
              </p>
              <p className="notice-text">Maximum file size: 5MB per document</p>
              <p className="notice-text">
                You will need to bring physical copies on your schedule visit
              </p>

              <p className="notice-text">
                If College Honor Certificate is required to verify your academic
                honors and qualify for tuition discounts.
              </p>
            </div>

            <div
              className="choices2 reqcho"
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn5"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn6"
                onClick={handleContinueWithoutUpload}
                disabled={isSubmitting}
                style={{ backgroundColor: "#1A3D5C" }}
              >
                Continue without uploading
              </button>
              <button type="submit" className="btn6" disabled={isSubmitting}>
                {isSubmitting ? "Uploading..." : "Upload & Continue"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdmissionStep3;
