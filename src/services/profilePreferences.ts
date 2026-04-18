import type { AuthUser } from "../types/user";

const PROFILE_IMAGE_STORAGE_KEY = "aics-profile-images";
const PROFILE_IMAGE_UPDATED_EVENT = "aics-profile-image-updated";

type ProfileImageStore = Record<string, string>;

const readProfileImageStore = (): ProfileImageStore => {
  if (typeof window === "undefined") {
    return {};
  }

  const rawValue = localStorage.getItem(PROFILE_IMAGE_STORAGE_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ProfileImageStore;
    return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
  } catch (error) {
    console.error("Failed to read stored profile images", error);
    return {};
  }
};

const writeProfileImageStore = (nextStore: ProfileImageStore) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(PROFILE_IMAGE_STORAGE_KEY, JSON.stringify(nextStore));
};

const emitProfileImageUpdate = (profileKey: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PROFILE_IMAGE_UPDATED_EVENT, {
      detail: { profileKey },
    }),
  );
};

export const getProfileImageUpdatedEventName = () => PROFILE_IMAGE_UPDATED_EVENT;

export const getStoredProfileImage = (profileKey: string | null) => {
  if (!profileKey) {
    return null;
  }

  return readProfileImageStore()[profileKey] || null;
};

export const setStoredProfileImage = (
  profileKey: string | null,
  imageDataUrl: string,
) => {
  if (!profileKey) {
    throw new Error("A valid profile image key is required.");
  }

  const currentStore = readProfileImageStore();
  currentStore[profileKey] = imageDataUrl;
  writeProfileImageStore(currentStore);
  emitProfileImageUpdate(profileKey);
  return imageDataUrl;
};

export const removeStoredProfileImage = (profileKey: string | null) => {
  if (!profileKey) {
    return;
  }

  const currentStore = readProfileImageStore();
  delete currentStore[profileKey];
  writeProfileImageStore(currentStore);
  emitProfileImageUpdate(profileKey);
};

export const getProfileImageKeyFromUser = (user?: AuthUser | null) => {
  if (!user) {
    return null;
  }

  if (user.role === "student") {
    return user.studentNumber
      ? `student:${user.studentNumber.toUpperCase()}`
      : `student:${user.id}`;
  }

  if (user.employeeId) {
    return `staff:${user.employeeId.toUpperCase()}`;
  }

  return `staff:${user.role}:${(user.branch || "").trim().toUpperCase()}`;
};

export const createProfileImageDataUrl = async (
  file: File,
  options?: {
    maxSize?: number;
    quality?: number;
  },
) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const maxSize = options?.maxSize ?? 256;
  const quality = options?.quality ?? 0.86;

  const sourceDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read this image file."));
    };

    reader.onerror = () => reject(new Error("Unable to read this image file."));
    reader.readAsDataURL(file);
  });

  return new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const largestSide = Math.max(image.width, image.height, 1);
      const scale = Math.min(1, maxSize / largestSide);
      const nextWidth = Math.max(1, Math.round(image.width * scale));
      const nextHeight = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = nextWidth;
      canvas.height = nextHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Unable to prepare this image for upload."));
        return;
      }

      context.drawImage(image, 0, 0, nextWidth, nextHeight);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.onerror = () =>
      reject(new Error("Unable to prepare this image for upload."));
    image.src = sourceDataUrl;
  });
};
