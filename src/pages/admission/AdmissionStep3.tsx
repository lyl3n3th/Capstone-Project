import {
  MdOutlineAttachFile,
  MdOutlineDriveFolderUpload,
} from "react-icons/md";
import { FaCircleExclamation } from "react-icons/fa6";
import "../../styles/main.css";
import Progress from "../../components/Progress";
import React, { useEffect, useRef, useState } from "react";
import { ToastContainer } from "../../components/common/Toast";
import {
  getAdmissionRequirements,
  getAdmissionProgress,
  updateAdmissionProgress,
  uploadAdmissionRequirementFile,
} from "../../services/admission";
import {
  fetchSupabaseAdmissionApplicants,
  getStudentCredentialOverview,
  syncStudentCredentialUpload,
  type StudentPortalCredentialItem,
} from "../../services/adminStorage";

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface UploadedRequirementFile {
  name: string;
  previewUrl: string;
}

const normalizeRequirementName = (value: string) => value.trim().toLowerCase();

function AdmissionStep3() {
  const selectedBranch = getQueryParam("branch") || "";
  const studentStatus = getQueryParam("status") || "";
  const trackingNumber = getQueryParam("trackingNumber") || "";
  const program = getQueryParam("program") || "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Record<string, UploadedRequirementFile>
  >({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [allowPartialRequirementUpload, setAllowPartialRequirementUpload] =
    useState(false);
  const [existingCredentialItems, setExistingCredentialItems] = useState<
    StudentPortalCredentialItem[]
  >([]);
  const [redoRequirementCodeOverrides, setRedoRequirementCodeOverrides] =
    useState<string[]>([]);
  const previewUrlsRef = useRef<Record<string, string>>({});

  // State for honor selection from draft
  const [studentHonor, setStudentHonor] = useState<string>("No Honor");

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

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (!trackingNumber) {
      setAllowPartialRequirementUpload(false);
      setRedoRequirementCodeOverrides([]);
      return;
    }

    let isActive = true;

    const loadRequirementUploadMode = async () => {
      try {
        const application = await getAdmissionProgress(trackingNumber);
        if (!isActive) {
          return;
        }

        const credentialOverview = getStudentCredentialOverview({
          branch: application?.branchCode || selectedBranch,
          trackingNumber: application?.trackingNumber || trackingNumber,
        });
        const localOverviewItems = credentialOverview?.items ?? [];
        const rejectedRequirementNames = new Set(
          localOverviewItems
            .filter((item) => item.statusLabel === "Needs Reupload")
            .map((item) => normalizeRequirementName(item.name)),
        );
        const rejectionReason = application?.rejectionReason?.toLowerCase() || "";
        const applicationRequirements = application
          ? getAdmissionRequirements(
              application.studentStatus,
              application.programName,
              application.honorLabel || "No Honor",
            )
          : [];

        applicationRequirements.forEach((requirement) => {
          if (rejectionReason.includes(normalizeRequirementName(requirement.name))) {
            rejectedRequirementNames.add(normalizeRequirementName(requirement.name));
          }
        });
        const rejectedRequirementCodes = applicationRequirements
          .filter((requirement) =>
            rejectedRequirementNames.has(normalizeRequirementName(requirement.name)),
          )
          .map((requirement) => requirement.code);

        let supabaseItems: StudentPortalCredentialItem[] = [];

        try {
          const supabaseApplicants = await fetchSupabaseAdmissionApplicants(
            application?.branchCode || selectedBranch,
          );
          const supabaseApplicant = supabaseApplicants.find(
            (applicant) =>
              applicant.trackingNumber.trim().toUpperCase() ===
              (application?.trackingNumber || trackingNumber).trim().toUpperCase(),
          );

          supabaseItems = applicationRequirements.map((requirement) => {
            const attachment = supabaseApplicant?.attachments?.find(
              (candidate) =>
                normalizeRequirementName(candidate.name) ===
                normalizeRequirementName(requirement.name),
            );
            const isRejected = rejectedRequirementNames.has(
              normalizeRequirementName(requirement.name),
            );
            const hasUploadedFile =
              Boolean(attachment?.url) && attachment?.url !== "#" && !isRejected;

            return {
              code: requirement.code,
              name: requirement.name,
              isSubmitted: hasUploadedFile,
              reviewStatus: isRejected ? "Rejected" : hasUploadedFile ? "Pending" : "Pending",
              statusLabel: isRejected
                ? "Needs Reupload"
                : hasUploadedFile
                  ? "Under Review"
                  : "Pending Submission",
              url: hasUploadedFile ? attachment?.url : undefined,
            };
          });
        } catch (queueError) {
          console.warn("Unable to load saved requirement files", queueError);
        }

        const mergedItems =
          supabaseItems.length > 0
            ? supabaseItems.map((supabaseItem) => {
                const localItem = localOverviewItems.find(
                  (item) =>
                    normalizeRequirementName(item.name) ===
                    normalizeRequirementName(supabaseItem.name),
                );

                if (localItem?.statusLabel === "Needs Reupload") {
                  return localItem;
                }

                return supabaseItem.isSubmitted ? supabaseItem : localItem || supabaseItem;
              })
            : localOverviewItems;
        const hasRedoCredential = mergedItems.some(
          (item) => item.statusLabel === "Needs Reupload",
        );

        setAllowPartialRequirementUpload(
          Boolean(
            application &&
              application.applicationStatus === "draft" &&
              (application.requirementsUploadedAt ||
                hasRedoCredential ||
                rejectedRequirementCodes.length > 0),
          ),
        );
        setExistingCredentialItems(mergedItems);
        setRedoRequirementCodeOverrides(rejectedRequirementCodes);
      } catch (error) {
        console.warn("Unable to load requirement upload mode", error);
        if (isActive) {
          setAllowPartialRequirementUpload(false);
          setExistingCredentialItems([]);
          setRedoRequirementCodeOverrides([]);
        }
      }
    };

    void loadRequirementUploadMode();

    return () => {
      isActive = false;
    };
  }, [selectedBranch, trackingNumber]);

  const currentRequirements = getAdmissionRequirements(
    studentStatus,
    program,
    studentHonor,
  );
  const existingCredentialByName = new Map(
    existingCredentialItems.map((item) => [item.name.trim().toLowerCase(), item]),
  );
  const redoRequirementCodes = new Set(
    [
      ...redoRequirementCodeOverrides,
      ...currentRequirements
        .filter(
          (requirement) =>
            existingCredentialByName.get(requirement.name.trim().toLowerCase())
              ?.statusLabel === "Needs Reupload",
        )
        .map((requirement) => requirement.code),
    ],
  );
  const isRedoUploadMode =
    allowPartialRequirementUpload && redoRequirementCodes.size > 0;
  const canEditRequirement = (requirementCode: string) =>
    !isRedoUploadMode || redoRequirementCodes.has(requirementCode);
  const visibleRequirements = isRedoUploadMode
    ? currentRequirements.filter((requirement) =>
        redoRequirementCodes.has(requirement.code),
      )
    : currentRequirements;
  const missingRequiredRequirements = currentRequirements.filter(
    (requirement) =>
      !isRedoUploadMode &&
      !requirement.optional &&
      !uploadedFiles[requirement.code],
  );
  const hasMissingRequiredRequirements =
    missingRequiredRequirements.length > 0;
  const hasHonorCertificateRequirement = currentRequirements.some(
    (requirement) => requirement.code === "honor_certificate",
  );

  // Handle file selection
  const handleFileChange = (
    requirementCode: string,
    requirementName: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const previousPreviewUrl = previewUrlsRef.current[requirementCode];
      if (previousPreviewUrl) {
        URL.revokeObjectURL(previousPreviewUrl);
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current[requirementCode] = previewUrl;

      setUploadedFiles((prev) => ({
        ...prev,
        [requirementCode]: {
          name: file.name,
          previewUrl,
        },
      }));
      addToast(`${requirementName} selected successfully!`, "success");
    }
  };

  // Function to continue without uploading
  const handleContinueWithoutUpload = async () => {
    if (hasMissingRequiredRequirements) {
      addToast(
        `Please upload ${missingRequiredRequirements
          .map((requirement) => requirement.name)
          .join(", ")} before continuing.`,
        "error",
      );
      return;
    }

    try {
      await updateAdmissionProgress({
        trackingNumber,
        currentStep: 3,
      });

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
        window.location.href = `/confirmation?trackingNumber=${encodeURIComponent(trackingNumber)}`;
      }, 500);
    } catch (err) {
      console.error(err);
      addToast(
        err instanceof Error
          ? err.message
          : "Unable to update the admission record right now.",
        "error",
      );
    }
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasMissingRequiredRequirements) {
      addToast(
        `Please upload ${missingRequiredRequirements
          .map((requirement) => requirement.name)
          .join(", ")} before continuing.`,
        "error",
      );
      return;
    }

    const hasFiles = visibleRequirements.some((requirement) => {
      const input = document.getElementById(
        requirement.code,
      ) as HTMLInputElement | null;
      return input?.files?.[0] != null;
    });

    if (!hasFiles) {
      if (allowPartialRequirementUpload) {
        addToast("Please select the credential that needs to be reuploaded.", "error");
        return;
      }

      addToast(
        "No files selected. You can follow up these documents later in the Student Portal once enrolled.",
        "info",
      );
      await handleContinueWithoutUpload();
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadableRequirements = visibleRequirements.filter((requirement) =>
        canEditRequirement(requirement.code),
      );
      const uploads = uploadableRequirements.map(async (requirement) => {
        const input = document.getElementById(
          requirement.code,
        ) as HTMLInputElement | null;
        const file = input?.files?.[0];
        if (!file) {
          return null;
        }

        const uploadResult = await uploadAdmissionRequirementFile({
          trackingNumber,
          requirementCode: requirement.code,
          requirementName: requirement.name,
          file,
        });

        if (isRedoUploadMode) {
          await syncStudentCredentialUpload({
            branch: selectedBranch,
            trackingNumber,
            requirementName: requirement.name,
            mimeType: file.type,
            storagePath: uploadResult.storagePath,
          });
        }

        return uploadResult;
      });

      await Promise.all(uploads);
      await updateAdmissionProgress({
        trackingNumber,
        currentStep: isRedoUploadMode ? 4 : 3,
        applicationStatus: isRedoUploadMode ? "submitted" : undefined,
        markSubmitted: isRedoUploadMode,
        rejectionReason: isRedoUploadMode ? "" : undefined,
      });

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
        window.location.href = `/confirmation?trackingNumber=${encodeURIComponent(trackingNumber)}`;
      }, 500);
    } catch (err) {
      console.error(err);
      addToast(
        err instanceof Error
          ? err.message
          : "Unable to upload the selected files right now.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    const existing = sessionStorage.getItem("enrollmentDraft");
    const draft = existing ? JSON.parse(existing) : {};

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
      <div className="container admission-req-container admission-step3-page">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="container1 admission-step3-progress">
          <Progress current={3} />
        </div>
        <div className="mcontainer mcnt admission-step3-content">
          <div className="header2 admission-step3-card">
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
    <div className="container admission-req-container admission-step3-page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1 admission-step3-progress">
        <Progress current={3} />
      </div>

      <div className="mcontainer mcnt admission-step3-content">
        <div className="header2 admission-step3-card">
          <div className="syb">
            <h2>Upload Requirements</h2>
            <p>
              You may upload any available documents now. Missing files can be
              followed up later once you are enrolled.
            </p>
            {hasHonorCertificateRequirement && (
              <div className="honor-notice">
                <p>
                  <strong>Honor Certificate Follow-up</strong>
                </p>
                <p>
                  You indicated: <strong>{studentHonor}</strong>. You may upload
                  your Honor Certificate now, or submit it later in the Student
                  Portal once enrolled to validate your academic honor and
                  tuition discount eligibility.
                </p>
              </div>
            )}
          </div>

          <form className="upload-form" onSubmit={handleSubmit}>
            <div className="upload-grid">
              {visibleRequirements.map((requirement) => {
                const inputId = requirement.code;
                const hasFile = uploadedFiles[requirement.code];
                const existingCredential = existingCredentialByName.get(
                  requirement.name.trim().toLowerCase(),
                );
                const isEditable = canEditRequirement(requirement.code);
                const isExistingUploaded =
                  isRedoUploadMode &&
                  existingCredential?.isSubmitted &&
                  existingCredential.statusLabel !== "Needs Reupload";
                const statusClass = hasFile
                  ? "ready"
                  : isExistingUploaded
                    ? "ready"
                    : existingCredential?.statusLabel === "Needs Reupload"
                      ? "required"
                  : requirement.optional
                    ? "optional"
                    : "required";

                return (
                  <div
                    key={requirement.code}
                    className={`upload-group ${hasFile || isExistingUploaded ? "has-file" : ""}`}
                  >
                    <div className="upload-group-head">
                      <div>
                        <label htmlFor={inputId} className="upload-label">
                          {requirement.name}
                        </label>
                        <p className="upload-caption">
                          {requirement.optional
                            ? "Optional document"
                            : isExistingUploaded
                              ? "Already uploaded"
                              : existingCredential?.statusLabel === "Needs Reupload"
                                ? "Needs reupload"
                                : "Required document"}
                        </p>
                      </div>
                      <span className={`upload-badge ${statusClass}`}>
                        {hasFile
                          ? "Selected"
                          : isExistingUploaded
                            ? "Uploaded"
                            : existingCredential?.statusLabel === "Needs Reupload"
                              ? "Needs Reupload"
                          : requirement.optional
                            ? "Optional"
                            : "Required"}
                      </span>
                    </div>

                    <label htmlFor={inputId} className="file-wrapper">
                      <span className="file-trigger">
                        <MdOutlineDriveFolderUpload className="icon" />
                        {isExistingUploaded
                          ? "Already uploaded"
                          : hasFile
                            ? "Replace file"
                            : "Choose file"}
                      </span>
                      <span className="upload-text">
                        {hasFile ? (
                          <>
                            <MdOutlineAttachFile />
                            {uploadedFiles[requirement.code].name}
                          </>
                        ) : isExistingUploaded ? (
                          <>
                            <MdOutlineAttachFile />
                            Uploaded credential on file
                          </>
                        ) : (
                          "No file selected"
                        )}
                      </span>
                      <input
                        className="file-input"
                        type="file"
                        id={inputId}
                        name={inputId}
                        required={
                          isRedoUploadMode
                            ? redoRequirementCodes.has(requirement.code)
                            : !requirement.optional
                        }
                        disabled={!isEditable}
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) =>
                          handleFileChange(
                            requirement.code,
                            requirement.name,
                            e,
                          )
                        }
                      />
                    </label>

                    {hasFile && (
                      <div className="selected-file-bar">
                        <span className="selected-file-name">
                          <MdOutlineAttachFile />
                          {uploadedFiles[requirement.code].name}
                        </span>
                        <a
                          className="view-file-link"
                          href={uploadedFiles[requirement.code].previewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View file
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="choices-note">
              <div className="note-header">
                <FaCircleExclamation className="exclamation-icon" />
                <p className="note">Important Notes:</p>
              </div>

              <div className="notice-list">
                <p className="notice-text">
                  Birth Certificate/PSA is required before you can continue.
                </p>
                <p className="notice-text">Upload clear and readable files.</p>
                <p className="notice-text">
                  Accepted formats: PDF, JPG, and PNG.
                </p>
                <p className="notice-text">
                  Maximum file size is 5MB per document.
                </p>
                <p className="notice-text">
                  Optional missing files can be followed up and uploaded later
                  in the Student Portal once you are enrolled.
                </p>
                <p className="notice-text">
                  Bring the physical copies during your scheduled visit.
                </p>
                {hasHonorCertificateRequirement && (
                  <p className="notice-text">
                    Your Honor Certificate may also be submitted later to follow
                    up your discount eligibility.
                  </p>
                )}
              </div>
            </div>

            <div className="choices2 reqcho">
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
                className="btn5 btn-quiet"
                onClick={handleContinueWithoutUpload}
                disabled={isSubmitting || hasMissingRequiredRequirements}
              >
                Continue without optional files
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
