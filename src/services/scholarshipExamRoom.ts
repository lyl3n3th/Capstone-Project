import { supabase } from "../lib/supabase";

const SCOPE = "scholarship-exam-room";

export async function fetchScholarshipExamRoom(branch: string): Promise<string> {
  const [setting, rooms] = await Promise.all([
    supabase.rpc("get_branch_local_storage_record", { p_branch: branch, p_scope: SCOPE }),
    supabase.rpc("list_assignment_rooms", { p_branch: branch }),
  ]);
  if (setting.error) throw new Error(setting.error.message);
  if (rooms.error) throw new Error(rooms.error.message);
  const name = String(setting.data?.roomName ?? "").trim();
  return (rooms.data as Array<{ room_name: string }> | null)?.find(
    (room) => room.room_name === name,
  )?.room_name ?? "";
}

export async function saveScholarshipExamRoom(branch: string, roomName: string) {
  const name = roomName.trim();
  if (name) {
    const { data, error } = await supabase.rpc("list_assignment_rooms", { p_branch: branch });
    if (error) throw new Error(error.message);
    if (!(data as Array<{ room_name: string }> | null)?.some((room) => room.room_name === name)) {
      throw new Error("Choose an existing classroom from this branch. The room list may have changed.");
    }
  }
  const { error } = await supabase.rpc("upsert_branch_local_storage_record", {
    p_branch: branch, p_scope: SCOPE, p_payload: { roomName: name },
  });
  if (error) throw new Error(error.message);
}
