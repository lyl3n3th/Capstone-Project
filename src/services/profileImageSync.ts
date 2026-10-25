import { supabase } from "../lib/supabase";
import type { AuthUser } from "../types/user";
import {
  getLegacyStudentProfileImageKey,
  getProfileImageKeyFromUser,
  getStoredProfileImage,
  removeStoredProfileImage,
  setStoredProfileImage,
} from "./profilePreferences";

const reads = new Map<string, Promise<string | null>>();
const writes = new Map<string, Promise<string | null>>();
const revisions = new Map<string, number>();
const validImage = (image: unknown): image is string => typeof image === "string" &&
  image.length <= 512 * 1024 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(image);

const sharedProfile = (user: AuthUser) => {
  if (!user.id || !user.branch.trim()) throw new Error("Your student profile could not be identified. Please sign in again.");
  return { p_branch: user.branch, p_scope: `student-profile-image:${user.id}` };
};

export const getCachedProfileImageForUser = (user?: AuthUser | null) => {
  const cached = getStoredProfileImage(getProfileImageKeyFromUser(user));
  if (cached || !user || user.role !== "student") return cached;
  return getStoredProfileImage(getLegacyStudentProfileImageKey(user));
};

function cacheImage(user: AuthUser, image: string | null) {
  const key = getProfileImageKeyFromUser(user);
  if (image) setStoredProfileImage(key, image);
  else removeStoredProfileImage(key);
  if (user.role === "student") removeStoredProfileImage(getLegacyStudentProfileImageKey(user));
  return image;
}

export function saveProfileImageForUser(user: AuthUser, image: string | null) {
  const key = getProfileImageKeyFromUser(user)!;
  if (image !== null && !validImage(image)) return Promise.reject(new Error("Unable to save this profile picture. Choose another image."));
  if (user.role !== "student") return Promise.resolve(cacheImage(user, image));
  const revision = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, revision);
  // Serialize uploads/removals so a slower earlier request cannot restore an old image.
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => null).then(async () => {
    const { error } = await supabase.rpc("upsert_branch_local_storage_record", {
      ...sharedProfile(user),
      p_payload: { imageDataUrl: image, updatedAt: new Date().toISOString() },
    });
    if (error) throw new Error("Your profile picture could not be saved online. Please try again.");
    if (revisions.get(key) === revision) cacheImage(user, image);
    return image;
  });
  writes.set(key, pending);
  void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); }).catch(() => {});
  return pending;
}

export function fetchProfileImageForUser(user: AuthUser): Promise<string | null> {
  if (user.role !== "student") return Promise.resolve(getCachedProfileImageForUser(user));
  const key = getProfileImageKeyFromUser(user)!;
  const existing = reads.get(key);
  if (existing) return existing;
  const revision = revisions.get(key) ?? 0;
  const pending = (async () => {
    const writing = writes.get(key);
    if (writing) return writing;
    const { data, error } = await supabase.rpc("get_branch_local_storage_record", sharedProfile(user));
    if (error) throw new Error("Unable to load your saved profile picture.");
    if ((revisions.get(key) ?? 0) !== revision) return getCachedProfileImageForUser(user);
    if (data === null || data === undefined) {
      const legacyImage = getCachedProfileImageForUser(user);
      if (validImage(legacyImage)) return saveProfileImageForUser(user, legacyImage);
      return null;
    }
    // A saved null is a removal, so an older device must not upload its stale cache again.
    const image = validImage(data.imageDataUrl) ? data.imageDataUrl : null;
    return cacheImage(user, image);
  })();
  reads.set(key, pending);
  void pending.finally(() => { if (reads.get(key) === pending) reads.delete(key); }).catch(() => {});
  return pending;
}
