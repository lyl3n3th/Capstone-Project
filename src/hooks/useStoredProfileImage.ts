import { useEffect, useState } from "react";
import {
  createProfileImageDataUrl,
  getProfileImageKeyFromUser,
  getStoredProfileImage,
  getProfileImageUpdatedEventName,
  removeStoredProfileImage,
  setStoredProfileImage,
} from "../services/profilePreferences";
import type { AuthUser } from "../types/user";

export function useStoredProfileImage(user?: AuthUser | null) {
  const profileKey = getProfileImageKeyFromUser(user);
  const [profileImage, setProfileImage] = useState<string | null>(() =>
    getStoredProfileImage(profileKey),
  );

  useEffect(() => {
    setProfileImage(getStoredProfileImage(profileKey));
  }, [profileKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !profileKey) {
      return undefined;
    }

    const handleImageUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ profileKey?: string }>).detail;

      if (detail?.profileKey && detail.profileKey !== profileKey) {
        return;
      }

      setProfileImage(getStoredProfileImage(profileKey));
    };

    const handleStorage = () => {
      setProfileImage(getStoredProfileImage(profileKey));
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
    if (!profileKey) {
      throw new Error("No signed-in profile was found.");
    }

    const imageDataUrl = await createProfileImageDataUrl(file);
    setStoredProfileImage(profileKey, imageDataUrl);
    setProfileImage(imageDataUrl);
    return imageDataUrl;
  };

  const clearProfileImage = () => {
    removeStoredProfileImage(profileKey);
    setProfileImage(null);
  };

  return {
    profileImage,
    updateProfileImage,
    clearProfileImage,
  };
}
