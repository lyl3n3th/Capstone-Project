import { useEffect, useState } from "react";
import { useConfirmation } from "../../hooks/useConfirmation";
import {
  deleteBranchOffering,
  fetchBranchOfferings,
  fetchOfferingCatalog,
  fetchOfferingUsage,
  offeringKey,
  saveBranchOfferings,
  type OfferingChoice,
  type OfferingProgram,
  type OfferingUsage,
} from "../../services/branchOfferings";

interface Props {
  branch: string;
  onCancel: () => void;
  onSaved: () => void;
}

export default function BranchOfferingsEditor({ branch, onCancel, onSaved }: Props) {
  const requestConfirmation = useConfirmation();
  const [catalog, setCatalog] = useState<OfferingChoice[]>([]);
  const [selected, setSelected] = useState<OfferingChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newProgram, setNewProgram] = useState<OfferingProgram>("College");
  const [newName, setNewName] = useState("");
  const [usage, setUsage] = useState<OfferingUsage[]>([]);
  const [persistedKeys, setPersistedKeys] = useState<string[]>([]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const busy = saving || deletingKey !== null;
  const studentCount = (choice: OfferingChoice) =>
    Number(usage.find((item) => offeringKey(item) === offeringKey(choice))?.student_count ?? 0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchOfferingCatalog(branch), fetchBranchOfferings(branch), fetchOfferingUsage(branch)])
      .then(([choices, offerings, enrolled]) => {
        if (cancelled) return;
        const combined = new Map([...choices, ...offerings].map((item) => [offeringKey(item), item]));
        setCatalog([...combined.values()]);
        setPersistedKeys([...combined.keys()]);
        setUsage(enrolled);
        setSelected(offerings.map(({ program_name, track_name }) => ({ program_name, track_name })));
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load courses and strands.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branch]);

  const toggle = (choice: OfferingChoice, enabled: boolean) => {
    if (!enabled && studentCount(choice) > 0) return;
    setSelected((current) => enabled
      ? [...current, choice]
      : current.filter((item) => offeringKey(item) !== offeringKey(choice)));
  };

  const removeChoice = async (choice: OfferingChoice) => {
    const key = offeringKey(choice);
    if (studentCount(choice) > 0) {
      setError("This course or strand cannot be deleted while active students are taking it.");
      return;
    }
    if (!(await requestConfirmation(`Delete ${choice.track_name} from ${branch}?`, {
      title: "Delete Course / Strand", confirmLabel: "Delete", destructive: true,
    }))) return;
    setDeletingKey(key);
    setError("");
    setNotice("");
    try {
      if (persistedKeys.includes(key)) await deleteBranchOffering(branch, choice);
      setSelected((items) => items.filter((item) => offeringKey(item) !== key));
      setCatalog((items) => items.filter((item) => offeringKey(item) !== key));
      setPersistedKeys((keys) => keys.filter((item) => item !== key));
      setNotice(`${choice.track_name} removed from ${branch}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this course or strand.");
    } finally {
      setDeletingKey(null);
    }
  };

  const addChoice = () => {
    const name = newName.trim();
    if (!name) { setError("Enter a course or strand name."); return; }
    const choice: OfferingChoice = { program_name: newProgram, track_name: name };
    const existing = catalog.find((item) => offeringKey(item) === offeringKey(choice));
    if (!existing) setCatalog((current) => [...current, choice]);
    if (!selected.some((item) => offeringKey(item) === offeringKey(choice))) {
      setSelected((current) => [...current, existing ?? choice]);
    }
    setNewName("");
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveBranchOfferings(branch, selected);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save courses and strands.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="stf-offerings-editor" aria-label={`${branch} courses and strands`}>
      <h4>{branch}: Courses and Strands</h4>
      <p>Select what this branch offers. Courses and strands taken by active students cannot be deleted or unchecked.</p>
      {error && <div className="stf-error-msg" role="alert">{error}</div>}
      {notice && <p className="stf-branch-success" role="status">{notice}</p>}
      {loading ? <p role="status">Loading courses and strands...</p> : (
        <>
          <fieldset disabled={busy || !loaded} className="stf-offerings-options">
            {(["College", "Senior High School"] as const).map((program) => (
              <div className="stf-offerings-group" key={program}>
                <h5>{program === "College" ? "College Courses" : "Senior High School Strands"}</h5>
                {catalog.filter((item) => item.program_name === program).map((choice) => (
                  <div className="stf-offering-row" key={offeringKey(choice)}>
                  <label className="stf-offering-choice">
                    <input type="checkbox"
                      checked={selected.some((item) => offeringKey(item) === offeringKey(choice))}
                      disabled={studentCount(choice) > 0 && selected.some((item) => offeringKey(item) === offeringKey(choice))}
                      onChange={(event) => toggle(choice, event.target.checked)} />
                    <span>{choice.track_name}
                      {studentCount(choice) > 0 && <small className="stf-offering-usage">{studentCount(choice)} enrolled student(s) — cannot remove</small>}
                    </span>
                  </label>
                  <button type="button" className="stf-btn-delete-perm"
                    disabled={studentCount(choice) > 0}
                    aria-label={`Delete ${choice.track_name} from ${branch}`}
                    title={studentCount(choice) > 0 ? "Active students are taking this course or strand." : `Delete from ${branch}`}
                    onClick={() => void removeChoice(choice)}>
                    {deletingKey === offeringKey(choice) ? "Deleting..." : "Delete"}
                  </button>
                  </div>
                ))}
              </div>
            ))}
          </fieldset>
          {loaded && <p>{selected.length} course(s) / strand(s) selected. Selecting none stops new admissions for this branch.</p>}
          {loaded && (
            <fieldset disabled={busy} className="stf-offerings-new">
              <legend>Add a course or strand</legend>
              <label>Educational level
                <select className="stf-input" value={newProgram} onChange={(event) => setNewProgram(event.target.value as OfferingProgram)}>
                  <option value="College">College</option>
                  <option value="Senior High School">Senior High School</option>
                </select>
              </label>
              <label>Name
                <input className="stf-input" value={newName} maxLength={160}
                  placeholder={newProgram === "College" ? "e.g. BS Information Technology" : "e.g. STEM - Science, Technology, Engineering and Mathematics"}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addChoice(); } }} />
              </label>
              <button className="stf-action-btn stf-cancel-btn" type="button" onClick={addChoice}>Add to selection</button>
            </fieldset>
          )}
        </>
      )}
      <div className="stf-offerings-actions">
        <button className="stf-action-btn stf-cancel-btn" onClick={onCancel} disabled={busy}>Back to branches</button>
        <button className="stf-action-btn stf-save-btn" onClick={() => void save()} disabled={loading || busy || !loaded}>
          {saving ? "Saving..." : "Save Availability"}
        </button>
      </div>
    </section>
  );
}
