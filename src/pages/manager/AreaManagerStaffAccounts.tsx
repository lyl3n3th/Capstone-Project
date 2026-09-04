import React, { useEffect, useMemo, useState } from "react";
import {
  BsArrowCounterclockwise,
  BsCaretDownFill,
  BsCaretUpFill,
  BsEye,
  BsEyeSlash,
  BsPersonPlusFill,
  BsSearch,
} from "react-icons/bs";
import { MdBlock, MdDelete } from "react-icons/md";
import {
  addManagedBranch,
  buildEmployeeIdPreview,
  createStaffMember,
  fetchManagedBranches,
  fetchStaffMembers,
  moveStaffMemberToTrash,
  removeManagedBranch,
  updateStaffMember,
  type StaffMember,
} from "../../services/staffApi";
import SkeletonPage from "../../components/common/SkeletonPage";
import "../../styles/manager/area-managerStaff.css";

type SortKeys = "staff_id" | "full_name" | "role" | "branch" | "email";

const getStaffStatusLabel = (status?: StaffMember["status"]) =>
  status === "inactive" ? "Disabled" : "Active";

const AreaManagerStaffAccounts: React.FC = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDisabledModal, setShowDisabledModal] = useState(false);
  const [showBranchesModal, setShowBranchesModal] = useState(false);
  const [branchPendingRemoval, setBranchPendingRemoval] = useState<string | null>(
    null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [branchError, setBranchError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [managedBranches, setManagedBranches] = useState<string[]>([
    "Bacoor",
    "Taytay",
    "GMA",
  ]);
  const [newBranchName, setNewBranchName] = useState("");

  const [filterRole, setFilterRole] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [sortConfig, setSortConfig] = useState<{
    key: SortKeys;
    direction: "asc" | "desc";
  } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<StaffMember>({
    staff_id: "",
    first_name: "",
    last_name: "",
    role: "Registrar",
    branch: "Bacoor",
    email: "",
    contact_number: "",
    address: "",
    password: "",
    status: "active",
  });

  const employeeIdPreview = useMemo(
    () => buildEmployeeIdPreview(formData.branch),
    [formData.branch],
  );
  const disabledAccounts = useMemo(
    () => staff.filter((member) => member.status === "inactive"),
    [staff],
  );

  useEffect(() => {
    void loadStaffDirectory();
    void loadManagedBranches();
  }, []);

  const loadManagedBranches = async () => {
    try {
      const branches = await fetchManagedBranches();
      const branchNames = branches.map((branch) => branch.name).filter(Boolean);
      if (branchNames.length > 0) {
        setManagedBranches(branchNames.sort());
      }
      setBranchError("");
    } catch (err) {
      console.error("Error fetching branches:", err);
      setBranchError(
        err instanceof Error
          ? err.message
          : "Unable to load managed branches right now.",
      );
    }
  };

  const loadStaffDirectory = async () => {
    setLoading(true);
    try {
      const staffMembers = await fetchStaffMembers();
      setStaff(staffMembers);
      setError("");
    } catch (err) {
      console.error("Error fetching staff:", err);
      setError(
        "Unable to load staff accounts right now. Make sure the Supabase staff schema has been added.",
      );
    } finally {
      setLoading(false);
    }
  };

  const uniqueRoles = Array.from(
    new Set(staff.map((member) => member.role).filter(Boolean)),
  ).sort();
  const uniqueBranches = Array.from(
    new Set([...managedBranches, ...staff.map((member) => member.branch)]),
  ).sort();
  const uniqueStatuses = ["active", "inactive"];

  const totalStaff = staff.length;
  const activeStaffCount = staff.filter(
    (member) => member.status === "active",
  ).length;
  const disabledStaffCount = disabledAccounts.length;

  const validateForm = () => {
    const {
      first_name,
      last_name,
      role,
      email,
      contact_number,
      address,
      password,
    } = formData;
    const normalizedPassword = password?.trim() || "";

    if (
      !first_name ||
      !last_name ||
      !role ||
      !formData.branch ||
      !address ||
      !email ||
      !contact_number ||
      (!isEditing && !normalizedPassword)
    ) {
      setError("Error: All fields are required.");
      return false;
    }

    if (contact_number.replace(/\D/g, "").length !== 11) {
      setError("Error: Contact number must be 11 digits.");
      return false;
    }

    if (normalizedPassword && normalizedPassword.length < 8) {
      setError("Error: Password must be at least 8 characters long.");
      return false;
    }

    const isDuplicateEmail = staff.some(
      (member) =>
        member.email.toLowerCase() === email.toLowerCase() &&
        (isEditing ? member.staff_id !== formData.staff_id : true),
    );
    const isDuplicateBranchRole =
      formData.status === "active" &&
      staff.some(
        (member) =>
          member.branch === formData.branch &&
          member.role === formData.role &&
          member.status === "active" &&
          (isEditing ? member.staff_id !== formData.staff_id : true),
      );

    if (isDuplicateEmail) {
      setError("Error: Email already exists.");
      return false;
    }

    if (isDuplicateBranchRole) {
      setError(
        `Error: ${formData.branch} already has an active ${formData.role} account.`,
      );
      return false;
    }

    setError("");
    return true;
  };

  const handleSave = async () => {
    setSubmitted(true);
    if (!validateForm()) {
      return;
    }

    const hasManagerSetPassword = Boolean(formData.password?.trim());

    try {
      if (isEditing) {
        await updateStaffMember(formData.staff_id, formData, {
          requirePasswordChange: hasManagerSetPassword,
        });
      } else {
        await createStaffMember(formData);
      }

      await loadStaffDirectory();
      setShowModal(false);
      setSelectedStaff(null);
      setEditMode(false);
      setIsEditing(false);
      setSubmitted(false);
      setShowPassword(false);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save the staff account.",
      );
      console.error("Save error:", err);
    }
  };

  const handleDisableAccount = async (member: StaffMember) => {
    if (
      !window.confirm(
        `Disable ${member.first_name} ${member.last_name}'s account?`,
      )
    ) {
      return;
    }

    try {
      await updateStaffMember(member.staff_id, {
        ...member,
        password: "",
        status: "inactive",
      });
      await loadStaffDirectory();
      setShowModal(false);
      setSelectedStaff(null);
      setEditMode(false);
      setIsEditing(false);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to disable this staff account.",
      );
    }
  };

  const handleEnableAccount = async (member: StaffMember) => {
    if (
      !window.confirm(
        `Enable ${member.first_name} ${member.last_name}'s account again?`,
      )
    ) {
      return;
    }

    try {
      await updateStaffMember(member.staff_id, {
        ...member,
        password: "",
        status: "active",
      });
      await loadStaffDirectory();
      setShowModal(false);
      setSelectedStaff(null);
      setEditMode(false);
      setIsEditing(false);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to enable this staff account.",
      );
    }
  };

  const handleDeleteDisabledAccount = async (member: StaffMember) => {
    if (
      !window.confirm(
        `Delete ${member.first_name} ${member.last_name}'s disabled account?`,
      )
    ) {
      return;
    }

    try {
      await moveStaffMemberToTrash(member.staff_id);
      await loadStaffDirectory();
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete this disabled staff account.",
      );
    }
  };

  const handleAddBranch = async () => {
    const normalizedBranch = newBranchName.trim();

    if (!normalizedBranch) {
      setBranchError("Enter a branch name.");
      return;
    }

    const branchExists = managedBranches.some(
      (branch) => branch.toLowerCase() === normalizedBranch.toLowerCase(),
    );

    if (branchExists) {
      setBranchError(`${normalizedBranch} is already in your branch list.`);
      return;
    }

    try {
      const savedBranch = await addManagedBranch(normalizedBranch);
      await loadManagedBranches();
      setFormData((current) => ({
        ...current,
        branch: current.branch || savedBranch.name,
      }));
      setNewBranchName("");
      setBranchError("");
    } catch (err) {
      setBranchError(
        err instanceof Error ? err.message : "Failed to add this branch.",
      );
    }
  };

  const handleRemoveBranch = async (branchName: string) => {
    setBranchPendingRemoval(branchName);
    setBranchError("");
  };

  const handleConfirmRemoveBranch = async () => {
    if (!branchPendingRemoval) {
      return;
    }

    const branchName = branchPendingRemoval;
    try {
      await removeManagedBranch(branchName);
      const remainingBranches = managedBranches.filter(
        (branch) => branch !== branchName,
      );
      setManagedBranches(remainingBranches);
      setFilterBranch((current) => (current === branchName ? "" : current));
      setFormData((current) => ({
        ...current,
        branch:
          current.branch === branchName
            ? remainingBranches[0] || ""
            : current.branch,
      }));
      setBranchPendingRemoval(null);
      setBranchError("");
    } catch (err) {
      setBranchError(
        err instanceof Error ? err.message : "Failed to remove this branch.",
      );
      setBranchPendingRemoval(null);
    }
  };

  const getInputClass = (fieldName: keyof StaffMember) => {
    const value = formData[fieldName]?.toString() || "";

    if (!submitted) {
      return "stf-input";
    }

    if (fieldName === "password" && isEditing) {
      return "stf-input";
    }

    return value.trim() === "" ? "stf-input error-field" : "stf-input";
  };

  const processedStaff = useMemo(() => {
    const filtered = staff.filter((member) => {
      const fullName =
        `${member.first_name} ${member.last_name}`.toLowerCase();
      const matchesSearch =
        fullName.includes(searchTerm.toLowerCase()) ||
        member.staff_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole ? member.role === filterRole : true;
      const matchesBranch = filterBranch ? member.branch === filterBranch : true;
      const matchesStatus = filterStatus ? member.status === filterStatus : true;

      return matchesSearch && matchesRole && matchesBranch && matchesStatus;
    });

    if (!sortConfig) {
      return filtered;
    }

    return [...filtered].sort((leftMember, rightMember) => {
      let leftValue: string;
      let rightValue: string;

      if (sortConfig.key === "full_name") {
        leftValue =
          `${leftMember.first_name} ${leftMember.last_name}`.toLowerCase();
        rightValue =
          `${rightMember.first_name} ${rightMember.last_name}`.toLowerCase();
      } else {
        leftValue = (leftMember[sortConfig.key as keyof StaffMember] || "")
          .toString()
          .toLowerCase();
        rightValue = (rightMember[sortConfig.key as keyof StaffMember] || "")
          .toString()
          .toLowerCase();
      }

      if (leftValue < rightValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }

      if (leftValue > rightValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }

      return 0;
    });
  }, [staff, searchTerm, filterRole, filterBranch, filterStatus, sortConfig]);

  const requestSort = (key: SortKeys) => {
    let direction: "asc" | "desc" = "asc";

    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc";
    }

    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortKeys) => {
    if (sortConfig?.key !== key) {
      return null;
    }

    return sortConfig.direction === "asc" ? (
      <BsCaretUpFill />
    ) : (
      <BsCaretDownFill />
    );
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentStaff = processedStaff.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(processedStaff.length / itemsPerPage);

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo(0, 0);
  };

  const handleAddNewStaff = () => {
    const defaultBranch = managedBranches[0] || "";
    setIsEditing(false);
    setEditMode(false);
    setSelectedStaff(null);
    setShowModal(true);
    setShowPassword(false);
    setFormData({
      staff_id: "",
      first_name: "",
      last_name: "",
      role: "Registrar",
      branch: defaultBranch,
      email: "",
      contact_number: "",
      address: "",
      password: "",
      status: "active",
    });
    setSubmitted(false);
    setError("");
  };

  const handleEditFromView = () => {
    if (!selectedStaff) {
      return;
    }

    setFormData({ ...selectedStaff, password: "" });
    setIsEditing(true);
    setEditMode(true);
    setSubmitted(false);
    setShowPassword(false);
    setError("");
  };

  if (loading) {
    return (
      <SkeletonPage
        className="stf-root"
        eyebrow="Directory"
        title="Staff Management"
        variant="table"
      />
    );
  }

  return (
    <div className="stf-root">
      <div className="stf-page-header">
        <div className="stf-header-title-group">
          <h1 className="stf-page-title">Staff Management</h1>
          <p className="stf-page-description">
            Manage registrar and branch administrator accounts for each branch,
            control active and disabled access, and keep staff logins in sync
            with Supabase.
          </p>
        </div>
      </div>

      <div className="stf-stats-badges">
        <div className="stf-stat-badge">
          <span className="stf-stat-label">Total Staff</span>
          <span className="stf-stat-value">{totalStaff}</span>
        </div>
        <div className="stf-stat-badge">
          <span className="stf-stat-label">Active</span>
          <span className="stf-stat-value">{activeStaffCount}</span>
        </div>
        <div className="stf-stat-badge">
          <span className="stf-stat-label">Disabled</span>
          <span className="stf-stat-value">{disabledStaffCount}</span>
        </div>
      </div>

      <div className="stf-container">
        <div className="stf-controls-grid">
          <div className="stf-search-wrapper">
            <BsSearch />
            <input
              type="text"
              placeholder="Search by name or employee ID..."
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="stf-filters-row">
            <select
              value={filterRole}
              onChange={(event) => {
                setFilterRole(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Roles</option>
              {uniqueRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select
              value={filterBranch}
              onChange={(event) => {
                setFilterBranch(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Branches</option>
              {uniqueBranches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(event) => {
                setFilterStatus(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Status</option>
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>
                  {getStaffStatusLabel(status as StaffMember["status"])}
                </option>
              ))}
            </select>
            <button
              className="stf-trash-toggle"
              onClick={() => setShowDisabledModal(true)}
            >
              <MdBlock size={16} /> Disabled Accounts ({disabledAccounts.length})
            </button>
            <button className="stf-add-btn" onClick={handleAddNewStaff}>
              <BsPersonPlusFill /> Add Staff
            </button>
            <button
              className="stf-branches-btn"
              onClick={() => {
                setShowBranchesModal(true);
                setBranchError("");
              }}
            >
              Manage Branches
            </button>
          </div>
        </div>

        <p className="stf-results-count">
          Showing <strong>{currentStaff.length}</strong> of{" "}
          <strong>{processedStaff.length}</strong> staff members
        </p>

        <div className="stf-table-wrapper">
          <table className="stf-table">
            <thead>
              <tr>
                <th
                  onClick={() => requestSort("staff_id")}
                  className="stf-sortable"
                >
                  Employee ID {getSortIcon("staff_id")}
                </th>
                <th
                  onClick={() => requestSort("full_name")}
                  className="stf-sortable"
                >
                  Full Name {getSortIcon("full_name")}
                </th>
                <th
                  onClick={() => requestSort("role")}
                  className="stf-sortable"
                >
                  Role {getSortIcon("role")}
                </th>
                <th
                  onClick={() => requestSort("branch")}
                  className="stf-sortable"
                >
                  Branch {getSortIcon("branch")}
                </th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentStaff.map((member) => (
                <tr key={member.staff_id}>
                  <td className="stf-id-col">{member.staff_id}</td>
                  <td className="stf-name-col">
                    {member.first_name} {member.last_name}
                  </td>
                  <td className="stf-role-col">{member.role}</td>
                  <td className="stf-branch-col">{member.branch}</td>
                  <td>
                    <span
                      className={`stf-status-badge stf-status-${member.status?.toLowerCase() || "active"}`}
                    >
                      {getStaffStatusLabel(member.status)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="stf-view-btn"
                      onClick={() => {
                        setSelectedStaff(member);
                        setEditMode(false);
                        setShowModal(true);
                        setSubmitted(false);
                        setError("");
                      }}
                    >
                      <BsEye /> View
                    </button>
                  </td>
                </tr>
              ))}
              {currentStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="stf-empty-state">
                    No staff members found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="stf-pagination">
            <button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className="stf-page-btn"
            >
              Previous
            </button>
            <div className="stf-page-info">
              <span>
                Page <strong>{currentPage}</strong> of {totalPages}
              </span>
            </div>
            <button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="stf-page-btn"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {showModal && selectedStaff && !editMode ? (
        <div
          className="stf-modal-overlay"
          onClick={() => {
            setShowModal(false);
            setSelectedStaff(null);
            setEditMode(false);
          }}
        >
          <div className="stf-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="stf-modal-header">
              <h3 className="stf-modal-title">Staff Profile</h3>
              <button
                className="stf-modal-close"
                onClick={() => {
                  setShowModal(false);
                  setSelectedStaff(null);
                  setEditMode(false);
                }}
              >
                &times;
              </button>
            </div>
            <div className="stf-modal-body">
              {error ? <div className="stf-error-msg">{error}</div> : null}
              <div className="stf-info-grid">
                <div className="stf-field full">
                  <label>Full Name</label>
                  <div className="stf-value-box">
                    {selectedStaff.first_name} {selectedStaff.last_name}
                  </div>
                </div>
                <div className="stf-field">
                  <label>Employee ID</label>
                  <div className="stf-value-box">{selectedStaff.staff_id}</div>
                </div>
                <div className="stf-field">
                  <label>Role</label>
                  <div className="stf-value-box">{selectedStaff.role}</div>
                </div>
                <div className="stf-field">
                  <label>Branch</label>
                  <div className="stf-value-box">{selectedStaff.branch}</div>
                </div>
                <div className="stf-field">
                  <label>Status</label>
                  <div
                    className={`stf-value-box stf-status-${selectedStaff.status?.toLowerCase() || "active"}`}
                  >
                    {getStaffStatusLabel(selectedStaff.status)}
                  </div>
                </div>
                <div className="stf-field full">
                  <label>Email Address</label>
                  <div className="stf-value-box stf-email-box">
                    {selectedStaff.email}
                  </div>
                </div>
                <div className="stf-field full">
                  <label>Contact Number</label>
                  <div className="stf-value-box">
                    {selectedStaff.contact_number}
                  </div>
                </div>
                <div className="stf-field full">
                  <label>Home Address</label>
                  <div className="stf-value-box stf-address-box">
                    {selectedStaff.address}
                  </div>
                </div>
              </div>
            </div>
            <div className="stf-modal-footer">
              {selectedStaff.status === "inactive" ? (
                <button
                  className="stf-action-btn stf-save-btn"
                  onClick={() => handleEnableAccount(selectedStaff)}
                >
                  <BsArrowCounterclockwise /> Enable Account
                </button>
              ) : (
                <button
                  className="stf-action-btn stf-remove-btn"
                  onClick={() => handleDisableAccount(selectedStaff)}
                >
                  <MdBlock size={16} /> Disable Account
                </button>
              )}
              <button
                className="stf-action-btn stf-edit-btn"
                onClick={handleEditFromView}
              >
                Edit Profile
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showModal && (!selectedStaff || editMode) ? (
        <div
          className="stf-modal-overlay"
          onClick={() => {
            setShowModal(false);
            setSelectedStaff(null);
            setEditMode(false);
            setIsEditing(false);
          }}
        >
          <div className="stf-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="stf-modal-header">
              <h3 className="stf-modal-title">
                {isEditing ? "Edit Staff" : "Register New Staff"}
              </h3>
              <button
                className="stf-modal-close"
                onClick={() => {
                  setShowModal(false);
                  setSelectedStaff(null);
                  setEditMode(false);
                  setIsEditing(false);
                }}
              >
                &times;
              </button>
            </div>
            <div className="stf-modal-body">
              {error ? <div className="stf-error-msg">{error}</div> : null}
              <div className="stf-input-grid">
                <div className="stf-field">
                  <label>Employee ID</label>
                  <input
                    type="text"
                    value={formData.staff_id || employeeIdPreview}
                    disabled
                    className="stf-input disabled"
                  />
                  {!isEditing ? (
                    <small>
                      Generated automatically from the selected branch when you
                      save this account.
                    </small>
                  ) : null}
                </div>
                <div className="stf-field">
                  <label>Branch</label>
                  <select
                    value={formData.branch}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        branch: event.target.value,
                      })
                    }
                    className={getInputClass("branch")}
                  >
                    {uniqueBranches.length === 0 ? (
                      <option value="">Add a branch first</option>
                    ) : null}
                    {uniqueBranches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="stf-field">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        first_name: event.target.value,
                      })
                    }
                    className={getInputClass("first_name")}
                  />
                </div>
                <div className="stf-field">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        last_name: event.target.value,
                      })
                    }
                    className={getInputClass("last_name")}
                  />
                </div>
                <div className="stf-field full">
                  <label>Role</label>
                  <select
                    value={formData.role}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        role: event.target.value as
                          | "Registrar"
                          | "Branch Administrator",
                      })
                    }
                    className={getInputClass("role")}
                  >
                    <option value="Registrar">Registrar</option>
                    <option value="Branch Administrator">
                      Branch Administrator
                    </option>
                  </select>
                </div>
                <div className="stf-field">
                  <label>Contact</label>
                  <input
                    type="text"
                    value={formData.contact_number}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        contact_number: event.target.value,
                      })
                    }
                    className={getInputClass("contact_number")}
                  />
                </div>
                <div className="stf-field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        email: event.target.value,
                      })
                    }
                    className={getInputClass("email")}
                  />
                </div>
                <div className="stf-field full">
                  <label>Home Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        address: event.target.value,
                      })
                    }
                    className={getInputClass("address")}
                  />
                </div>
                <div className="stf-field">
                  <label>{isEditing ? "New Password" : "Password"}</label>
                  <div className="stf-pass-container">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password || ""}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          password: event.target.value,
                        })
                      }
                      className={`${getInputClass("password")} stf-pass-input`}
                      placeholder={
                        isEditing ? "Leave blank to keep current password" : ""
                      }
                    />
                    <button
                      type="button"
                      className="stf-pass-toggle"
                      onClick={() => setShowPassword((current) => !current)}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <BsEyeSlash size={16} />
                      ) : (
                        <BsEye size={16} />
                      )}
                    </button>
                  </div>
                  <small>
                    {isEditing
                      ? "If you set a new password here, it becomes a temporary password and the staff member must change it on their next login."
                      : "The password you set here becomes a temporary password and must be changed by the staff member on first login."}
                  </small>
                </div>
              </div>
            </div>
            <div className="stf-modal-footer">
              <button
                className="stf-action-btn stf-cancel-btn"
                onClick={() => {
                  setShowModal(false);
                  setSelectedStaff(null);
                  setEditMode(false);
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
              <button
                className="stf-action-btn stf-save-btn"
                onClick={handleSave}
              >
                {isEditing ? "Save Changes" : "Register Staff"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDisabledModal ? (
        <div
          className="stf-modal-overlay"
          onClick={() => setShowDisabledModal(false)}
        >
          <div className="stf-trash-card" onClick={(event) => event.stopPropagation()}>
            <div className="stf-modal-header">
              <div className="stf-modal-title-wrap">
                <MdBlock size={18} />
                <h3 style={{ margin: 0 }}>Disabled Accounts</h3>
              </div>
              <button
                className="stf-modal-close"
                onClick={() => setShowDisabledModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="stf-modal-body">
              {error ? <div className="stf-error-msg">{error}</div> : null}
              <div className="stf-trash-top-row">
                <p className="stf-trash-count">
                  {disabledAccounts.length} disabled account(s)
                </p>
              </div>
              <div className="stf-table-wrapper">
                {disabledAccounts.length === 0 ? (
                  <div className="stf-empty-state">
                    No disabled staff accounts.
                  </div>
                ) : (
                  <table className="stf-table">
                    <thead>
                      <tr>
                        <th>Staff Info</th>
                        <th>Position</th>
                        <th>Branch</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disabledAccounts.map((member) => (
                        <tr key={member.staff_id}>
                          <td>
                            <strong>
                              {member.first_name} {member.last_name}
                            </strong>
                            <br />
                            <small>{member.staff_id}</small>
                          </td>
                          <td>{member.role}</td>
                          <td>{member.branch}</td>
                          <td style={{ textAlign: "right" }}>
                            <div className="stf-trash-btns-wrapper">
                              <button
                                className="stf-btn-restore"
                                onClick={() => handleEnableAccount(member)}
                              >
                                <BsArrowCounterclockwise /> Enable
                              </button>
                              <button
                                className="stf-btn-delete-perm"
                                onClick={() => handleDeleteDisabledAccount(member)}
                              >
                                <MdDelete size={14} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showBranchesModal ? (
        <div
          className="stf-modal-overlay"
          onClick={() => setShowBranchesModal(false)}
        >
          <div className="stf-branches-card" onClick={(event) => event.stopPropagation()}>
            <div className="stf-modal-header">
              <h3 className="stf-modal-title">Manage Branches</h3>
              <button
                className="stf-modal-close"
                onClick={() => setShowBranchesModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="stf-modal-body">
              {branchError ? (
                <div className="stf-error-msg">{branchError}</div>
              ) : null}
              <div className="stf-branch-add-row">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(event) => setNewBranchName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddBranch();
                    }
                  }}
                  placeholder="Branch name"
                  className="stf-input"
                />
                <button className="stf-action-btn stf-save-btn" onClick={handleAddBranch}>
                  Add Branch
                </button>
              </div>
              <div className="stf-branch-list">
                {managedBranches.length === 0 ? (
                  <div className="stf-empty-state">No managed branches yet.</div>
                ) : (
                  managedBranches.map((branch) => {
                    const assignedStaffCount = staff.filter(
                      (member) => member.branch === branch,
                    ).length;

                    return (
                      <div className="stf-branch-item" key={branch}>
                        <div>
                          <strong>{branch}</strong>
                          <span>{assignedStaffCount} staff account(s)</span>
                        </div>
                        <button
                          className="stf-btn-delete-perm"
                          onClick={() => handleRemoveBranch(branch)}
                          title={`Remove ${branch}`}
                        >
                          <MdDelete size={14} /> Delete
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {branchPendingRemoval ? (
        <div
          className="stf-modal-overlay"
          onClick={() => setBranchPendingRemoval(null)}
        >
          <div className="stf-confirm-card" onClick={(event) => event.stopPropagation()}>
            <div className="stf-modal-header">
              <h3 className="stf-modal-title">Remove Branch?</h3>
              <button
                className="stf-modal-close"
                onClick={() => setBranchPendingRemoval(null)}
              >
                &times;
              </button>
            </div>
            <div className="stf-modal-body">
              <p className="stf-confirm-copy">
                Are you sure you want to remove <strong>{branchPendingRemoval}</strong> from the branches handled by the area manager?
              </p>
              <p className="stf-confirm-note">
                Staff accounts assigned to this branch will no longer be able to use this branch while signing in until the branch is added again.
              </p>
            </div>
            <div className="stf-modal-footer">
              <button
                className="stf-action-btn stf-cancel-btn"
                onClick={() => setBranchPendingRemoval(null)}
              >
                Cancel
              </button>
              <button
                className="stf-action-btn stf-remove-btn"
                onClick={handleConfirmRemoveBranch}
              >
                Remove Branch
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AreaManagerStaffAccounts;
