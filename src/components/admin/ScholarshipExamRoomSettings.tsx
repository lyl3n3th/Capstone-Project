import { useEffect, useState } from "react";
import { fetchScholarshipExamRoom, saveScholarshipExamRoom } from "../../services/scholarshipExamRoom";

export default function ScholarshipExamRoomSettings({ branch, rooms }: { branch: string; rooms: string[] }) {
  const [room, setRoom] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState(false);
  // Use a primitive dependency so unrelated parent renders do not reset a draft selection.
  const roomKey = JSON.stringify(rooms);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setMessage("");
    void fetchScholarshipExamRoom(branch).then((value) => {
      if (active) setRoom(value);
    }).catch((error: unknown) => {
      if (active) {
        setLoadError(true);
        setMessage(error instanceof Error ? error.message : "Unable to load the scholarship exam room.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branch, roomKey]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveScholarshipExamRoom(branch, room);
      setMessage("Scholarship exam room saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the scholarship exam room.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="scholarship-exam-room-settings" aria-labelledby="scholarship-room-label">
      <label id="scholarship-room-label" htmlFor="scholarship-exam-room">Scholarship exam room</label>
      <p>Choose where applicants will take the scholarship exam at {branch} Branch.</p>
      <div className="academic-management-create-row">
        <select id="scholarship-exam-room" value={room} onChange={(event) => { setRoom(event.target.value); setMessage(""); }} disabled={loading || saving || loadError}>
          <option value="">To be announced</option>
          {rooms.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button type="button" className="assignment-selection-btn" onClick={() => void save()} disabled={loading || saving || loadError}>
          {saving ? "Saving..." : "Save Exam Room"}
        </button>
      </div>
      {rooms.length === 0 && <p>Add a classroom first before selecting an exam room.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
