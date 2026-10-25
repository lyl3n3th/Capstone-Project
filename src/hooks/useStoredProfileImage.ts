import { useEffect, useState } from "react";
import {
  createProfileImageDataUrl,
  getProfileImageKeyFromUser,
  getStoredProfileImage,
  getProfileImageUpdatedEventName,
} from "../services/profilePreferences";
import { fetchProfileImageForUser, getCachedProfileImageForUser, saveProfileImageForUser } from "../services/profileImageSync";
import type { AuthUser } from "../types/user";

export function useStoredProfileImage(user?: AuthUser | null) {
  const profileKey = getProfileImageKeyFromUser(user);
  const [imageState, setImageState] = useState(() => ({ key: profileKey, image: getCachedProfileImageForUser(user) }));
  const profileImage = imageState.key === profileKey ? imageState.image : getCachedProfileImageForUser(user);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = () => {
      void fetchProfileImageForUser(user).then(image => {
        if (!cancelled) setImageState({ key: profileKey, image });
      }).catch(error => { console.warn("Unable to refresh profile picture.", error); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [profileKey, user]);

  useEffect(() => {
    if (typeof window === "undefined" || !profileKey) {
      return undefined;
    }

    const handleImageUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ profileKey?: string }>).detail;

      if (detail?.profileKey && detail.profileKey !== profileKey) {
        return;
      }

      setImageState({ key: profileKey, image: getStoredProfileImage(profileKey) });
    };

    const handleStorage = () => {
      setImageState({ key: profileKey, image: getStoredProfileImage(profileKey) });
    };

    window.addEventListener(
      getProfileImageUpdatedEventName(),
      handleImageUpdate as EventListener,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        getProfileImageUpdatedEventName(),
        handleImageUpdate as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [profileKey]);

  const updateProfileImage = async (file: File) => {
    if (!profileKey || !user) {
      throw new Error("No signed-in profile was found.");
    }

    const imageDataUrl = await createProfileImageDataUrl(file);
    await saveProfileImageForUser(user, imageDataUrl);
    setImageState({ key: profileKey, image: imageDataUrl });
    return imageDataUrl;
  };

  const clearProfileImage = async () => {
    if (!user) return;
    await saveProfileImageForUser(user, null);
    setImageState({ key: profileKey, image: null });
  };

  return {
    profileImage,
    updateProfileImage,
    clearProfileImage,
  };
}
