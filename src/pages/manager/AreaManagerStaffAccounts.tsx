import React, { useState, useEffect, useMemo } from "react";
import {
  BsSearch,
  BsCaretDownFill,
  BsCaretUpFill,
  BsEye,
  BsEyeSlash,
  BsTrash3,
  BsArrowCounterclockwise,
  BsPersonPlusFill,
} from "react-icons/bs";
import { MdDeleteSweep } from "react-icons/md";
import {
  buildEmployeeIdPreview,
  createStaffMember,
  fetchStaffMembers,
  moveStaffMemberToTrash,
  permanentlyDeleteStaffMember,
  restoreStaffMember,
  updateStaffMember,
  type StaffMember,
} from "../../services/staffApi";
import "../../styles/manager/area-managerStaff.css";

type SortKeys = "staff_id" | "full_name" | "role" | "branch" | "email";

const AreaManagerStaffAccounts: React.FC = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [trash, setTrash] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Filter states
  const [filterRole, setFilterRole] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Sort states
  const [sortConfig, setSortConfig] = useState<{
    key: SortKeys;
    direction: "asc" | "desc";
  } | null>(null);

  // Pagination
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

  useEffect(() => {
    void loadStaffDirectory();
  }, []);

  const loadStaffDirectory = async () => {
    setLoading(true);
    try {
      const [activeStaff, trashedStaff] = await Promise.all([
        fetchStaffMembers(),
        fetchStaffMembers({ trash: true }),
      ]);
      setStaff(activeStaff);
      setTrash(trashedStaff);
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

  // Get unique filter values
  const uniqueRoles = Array.from(
    new Set(staff.map((s) => s.role).filter(Boolean)),
  ).sort();
  const uniqueBranches = Array.from(new Set(staff.map((s) => s.branch))).sort();
  const uniqueStatuses = ["active", "inactive"];

  // Stats for header
  const totalStaff = staff.length;
  const activeStaff = staff.filter((s) => s.status === "active").length;
  const registrars = staff.filter((s) => s.role === "Registrar").length;

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

    if (
      !first_name ||
      !last_name ||
      !role ||
      !address ||
      !email ||
      !contact_number ||
      (!isEditing && !password)
    ) {
      setError("Error: All fields are required.");
      return false;
    }

    if (contact_number.replace(/\D/g, "").length !== 11) {
      setError("Error: Contact number must be 11 digits.");
      return false;
    }

    const existingStaff = [...staff, ...trash];
    const isDuplicateEmail = existingStaff.some(
      (s) =>
        s.email.toLowerCase() === email.toLowerCase() &&
        (isEditing ? s.staff_id !== formData.staff_id : true),
    );
    const isDuplicateBranchRole = staff.some(
      (s) =>
        s.branch === formData.branch &&
        s.role === formData.role &&
        (isEditing ? s.staff_id !== formData.staff_id : true),
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
    if (!validateForm()) return;

    try {
      if (isEditing) {
        await updateStaffMember(formData.staff_id, formData);
      } else {
        await createStaffMember(formData);
      }
      await loadStaffDirectory();
      setShowModal(false);
      setSelectedStaff(null);
      setEditMode(false);
      setIsEditing(false);
      setSubmitted(false);
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

  const handleMoveToTrash = async (member: StaffMember) => {
    if (
      window.confirm(`Move ${member.first_name} ${member.last_name} to trash?`)
    ) {
      try {
        await moveStaffMemberToTrash(member.staff_id);
        await loadStaffDirectory();
        setShowModal(false);
        setSelectedStaff(null);
        setEditMode(false);
        setIsEditing(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to move this account to trash.",
        );
      }
    }
  };

  const handleRestore = async (member: StaffMember) => {
    if (window.confirm(`Restore ${member.first_name} to active staff?`)) {
      try {
        await restoreStaffMember(member.staff_id);
        await loadStaffDirectory();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to restore this staff account.",
        );
      }
    }
  };

  const handlePermanentDelete = async (staffId: string) => {
    if (
      window.confirm("Permanently delete this account? This cannot be undone.")
    ) {
      try {
        await permanentlyDeleteStaffMember(staffId);
        await loadStaffDirectory();
      } catch (err) {
        alert("Error deleting from server.");
      }
    }
  };

  const handleEmptyTrash = async () => {
    if (window.confirm("Permanently delete all accounts in trash?")) {
      try {
        await Promise.all(
          trash.map((item) => permanentlyDeleteStaffMember(item.staff_id)),
        );
        await loadStaffDirectory();
      } catch (err) {
        alert("Error deleting from server.");
      }
    }
  };

  const getInputClass = (fieldName: keyof StaffMember) => {
    const value = formData[fieldName]?.toString() || "";
    if (!submitted) return "stf-input";
    if (fieldName === "password" && isEditing) {
      return "stf-input";
    }
    return value.trim() === "" ? "stf-input error-field" : "stf-input";
  };

  // Processed staff with filters and sorting
  const processedStaff = useMemo(() => {
    let filtered = staff.filter((s) => {
      const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
      const matchesSearch =
        fullName.includes(searchTerm.toLowerCase()) ||
        s.staff_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole ? s.role === filterRole : true;
      const matchesBranch = filterBranch ? s.branch === filterBranch : true;
      const matchesStatus = filterStatus ? s.status === filterStatus : true;
      return matchesSearch && matchesRole && matchesBranch && matchesStatus;
    });

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;
        if (sortConfig.key === "full_name") {
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
        } else {
          aVal = (a[sortConfig.key as keyof StaffMember] || "")
            .toString()
            .toLowerCase();
          bVal = (b[sortConfig.key as keyof StaffMember] || "")
            .toString()
            .toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
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
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === "asc" ? (
      <BsCaretUpFill />
    ) : (
      <BsCaretDownFill />
    );
  };

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentStaff = processedStaff.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(processedStaff.length / itemsPerPage);

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo(0, 0);
  };

  const handleAddNewStaff = () => {
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
      branch: "Bacoor",
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
    if (selectedStaff) {
      setFormData({ ...selectedStaff, password: "" });
      setIsEditing(true);
      setEditMode(true);
      setSubmitted(false);
      setError("");
    }
  };

  if (loading)
    return <div className="stf-loading">Loading Staff Directory...</div>;

  return (
    <div className="stf-root">
      <div className="stf-page-header">
        <div className="stf-header-title-group">
          <h1 className="stf-page-title">Staff Management</h1>
          <p className="stf-page-description">
            Manage registrar and branch administrator accounts for each branch,
            track roles, and keep staff login access in sync with Supabase.
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
          <span className="stf-stat-value">{activeStaff}</span>
        </div>
        <div className="stf-stat-badge">
          <span className="stf-stat-label">Registrars</span>
          <span className="stf-stat-value">{registrars}</span>
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
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="stf-filters-row">
            <select
              value={filterRole}
              onChange={(e) => {
                setFilterRole(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Roles</option>
              {uniqueRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={filterBranch}
              onChange={(e) => {
                setFilterBranch(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Branches</option>
              {uniqueBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Status</option>
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <button
              className="stf-trash-toggle"
              onClick={() => setShowTrashModal(true)}
            >
              <BsTrash3 /> Trash ({trash.length})
            </button>
            <button className="stf-add-btn" onClick={handleAddNewStaff}>
              <BsPersonPlusFill /> Add Staff
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
                  <td className="stf-branch-col">
                    <span className="stf-branch-badge">{member.branch}</span>
                  </td>
                  <td>
                    <span
                      className={`stf-status-badge stf-status-${member.status?.toLowerCase() || "active"}`}
                    >
                      {member.status || "active"}
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
              {currentStaff.length === 0 && (
                <tr>
                  <td colSpan={6} className="stf-empty-state">
                    No staff members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
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
        )}
      </div>

      {/* Staff Profile Modal - View Mode */}
      {showModal && selectedStaff && !editMode && (
        <div
          className="stf-modal-overlay"
          onClick={() => {
            setShowModal(false);
            setSelectedStaff(null);
            setEditMode(false);
          }}
        >
          <div className="stf-modal-card" onClick={(e) => e.stopPropagation()}>
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
              {error && <div className="stf-error-msg">{error}</div>}
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
                    {selectedStaff.status || "active"}
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
              <button
                className="stf-action-btn stf-remove-btn"
                onClick={() => handleMoveToTrash(selectedStaff)}
              >
                <BsTrash3 /> Move to Trash
              </button>
              <button
                className="stf-action-btn stf-edit-btn"
                onClick={handleEditFromView}
              >
                Edit Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Modal */}
      {showModal && (!selectedStaff || editMode) && (
        <div
          className="stf-modal-overlay"
          onClick={() => {
            setShowModal(false);
            setSelectedStaff(null);
            setEditMode(false);
            setIsEditing(false);
          }}
        >
          <div className="stf-modal-card" onClick={(e) => e.stopPropagation()}>
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
              {error && <div className="stf-error-msg">{error}</div>}
              <div className="stf-input-grid">
                {/* Keep all your input fields here - they are fine */}
                <div className="stf-field">
                  <label>Employee ID</label>
                  <input
                    type="text"
                    value={formData.staff_id || employeeIdPreview}
                    disabled
                    className="stf-input disabled"
                  />
                  {!isEditing && (
                    <small>
                      Generated automatically from the selected branch when you
                      save this account.
                    </small>
                  )}
                </div>
                <div className="stf-field">
                  <label>Branch</label>
                  <select
                    value={formData.branch}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        branch: e.target.value as "GMA" | "Bacoor" | "Taytay",
                      })
                    }
                    className={getInputClass("branch")}
                  >
                    <option value="Bacoor">Bacoor</option>
                    <option value="GMA">GMA</option>
                    <option value="Taytay">Taytay</option>
                  </select>
                </div>
                <div className="stf-field">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    className={getInputClass("first_name")}
                  />
                </div>
                <div className="stf-field">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    className={getInputClass("last_name")}
                  />
                </div>
                <div className="stf-field full">
                  <label>Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        role: e.target.value as
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
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        contact_number: e.target.value,
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
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className={getInputClass("email")}
                  />
                </div>
                <div className="stf-field full">
                  <label>Home Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
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
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className={`${getInputClass("password")} stf-pass-input`}
                      placeholder={
                        isEditing ? "Leave blank to keep current password" : ""
                      }
                    />
                    <button
                      type="button"
                      className="stf-pass-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <BsEyeSlash size={16} />
                      ) : (
                        <BsEye size={16} />
                      )}
                    </button>
                  </div>
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
      )}

      {/* TRASH MODAL */}
      {showTrashModal && (
        <div
          className="stf-modal-overlay"
          onClick={() => setShowTrashModal(false)}
        >
          <div className="stf-trash-card" onClick={(e) => e.stopPropagation()}>
            <div className="stf-modal-header">
              <div className="stf-modal-title-wrap">
                <BsTrash3 size={18} /> <h3 style={{ margin: 0 }}>Trash Bin</h3>
              </div>
              <button
                className="stf-modal-close"
                onClick={() => setShowTrashModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="stf-modal-body">
              <div className="stf-trash-top-row">
                <p className="stf-trash-count">
                  {trash.length} deleted account(s)
                </p>
                {trash.length > 0 && (
                  <button
                    className="stf-empty-trash"
                    onClick={handleEmptyTrash}
                  >
                    <MdDeleteSweep size={16} /> Empty Trash
                  </button>
                )}
              </div>
              <div className="stf-table-wrapper">
                {trash.length === 0 ? (
                  <div className="stf-empty-state">No staff in trash.</div>
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
                      {trash.map((m) => (
                        <tr key={m.staff_id}>
                          <td>
                            <strong>
                              {m.first_name} {m.last_name}
                            </strong>
                            <br />
                            <small>{m.staff_id}</small>
                          </td>
                          <td>{m.role}</td>
                          <td>
                            <span className="stf-branch-badge">{m.branch}</span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="stf-trash-btns-wrapper">
                              <button
                                className="stf-btn-restore"
                                onClick={() => handleRestore(m)}
                              >
                                <BsArrowCounterclockwise /> Restore
                              </button>
                              <button
                                className="stf-btn-delete-perm"
                                onClick={() =>
                                  handlePermanentDelete(m.staff_id)
                                }
                              >
                                <BsTrash3 /> Delete
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
      )}
    </div>
  );
};

export default AreaManagerStaffAccounts;
