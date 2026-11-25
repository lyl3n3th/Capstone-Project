export interface StagedAdmissionRequirement {
  trackingNumber: string;
  requirementCode: string;
  requirementName: string;
  file: File;
}

interface StoredAdmissionRequirement {
  id: string;
  trackingNumber: string;
  requirementCode: string;
  requirementName: string;
  file: Blob;
  fileName: string;
  mimeType: string;
  lastModified: number;
  savedAt: number;
}

const DATABASE_NAME = "aics-admission-session";
const DATABASE_VERSION = 1;
const REQUIREMENTS_STORE = "requirements";
const NAVIGATION_MARKER_KEY = "aics-admission-internal-navigation";
const STAGED_FILE_RETENTION_MS = 24 * 60 * 60 * 1000;

export const navigateAdmissionPage = (url: string) => {
  sessionStorage.setItem(NAVIGATION_MARKER_KEY, String(Date.now()));
  window.location.href = url;
};

export const consumeAdmissionNavigationMarker = () => {
  const timestamp = Number(sessionStorage.getItem(NAVIGATION_MARKER_KEY));
  sessionStorage.removeItem(NAVIGATION_MARKER_KEY);
  return Number.isFinite(timestamp) && Date.now() - timestamp < 5_000;
};

const pruneExpiredRequirements = (database: IDBDatabase) =>
  new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(REQUIREMENTS_STORE, "readwrite");
    const request = transaction.objectStore(REQUIREMENTS_STORE).openCursor();
    const expiredBefore = Date.now() - STAGED_FILE_RETENTION_MS;
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        if ((cursor.value as StoredAdmissionRequirement).savedAt < expiredBefore) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(REQUIREMENTS_STORE)) {
        const store = database.createObjectStore(REQUIREMENTS_STORE, {
          keyPath: "id",
        });
        store.createIndex("trackingNumber", "trackingNumber", {
          unique: false,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const saveStagedAdmissionRequirement = async (
  requirement: StagedAdmissionRequirement,
) => {
  const database = await openDatabase();
  try {
    await pruneExpiredRequirements(database);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(REQUIREMENTS_STORE, "readwrite");
      const store = transaction.objectStore(REQUIREMENTS_STORE);
      store.put({
        id: `${requirement.trackingNumber}:${requirement.requirementCode}`,
        trackingNumber: requirement.trackingNumber,
        requirementCode: requirement.requirementCode,
        requirementName: requirement.requirementName,
        file: requirement.file,
        fileName: requirement.file.name,
        mimeType: requirement.file.type,
        lastModified: requirement.file.lastModified,
        savedAt: Date.now(),
      } satisfies StoredAdmissionRequirement);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

export const getStagedAdmissionRequirements = async (trackingNumber: string) => {
  const database = await openDatabase();
  try {
    await pruneExpiredRequirements(database);
    const records = await new Promise<StoredAdmissionRequirement[]>(
      (resolve, reject) => {
        const transaction = database.transaction(REQUIREMENTS_STORE, "readonly");
        const request = transaction
          .objectStore(REQUIREMENTS_STORE)
          .index("trackingNumber")
          .getAll(trackingNumber);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );

    return records.map((record) => ({
      trackingNumber: record.trackingNumber,
      requirementCode: record.requirementCode,
      requirementName: record.requirementName,
      file: new File([record.file], record.fileName, {
        type: record.mimeType,
        lastModified: record.lastModified,
      }),
    }));
  } finally {
    database.close();
  }
};

export const clearStagedAdmissionRequirements = async (trackingNumber: string) => {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(REQUIREMENTS_STORE, "readwrite");
      const index = transaction.objectStore(REQUIREMENTS_STORE).index("trackingNumber");
      const request = index.openCursor(IDBKeyRange.only(trackingNumber));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};
