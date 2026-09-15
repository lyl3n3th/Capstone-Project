import { useEffect, useRef } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  dispatchDueAutomatedBackups,
  syncBackupSnapshot,
} from "../../services/backupApi";

const BACKUP_SCHEDULER_LOCK_KEY = "aics-backup-scheduler-lock";
const BACKUP_SCHEDULER_INTERVAL_MS = 60_000;
const BACKUP_SCHEDULER_LEASE_MS = 90_000;

type BackupSchedulerLock = {
  ownerId: string;
  expiresAt: number;
};

const createSchedulerOwnerId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `backup-scheduler-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const readSchedulerLock = (): BackupSchedulerLock | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(BACKUP_SCHEDULER_LOCK_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as BackupSchedulerLock;
    if (
      parsed &&
      typeof parsed.ownerId === "string" &&
      typeof parsed.expiresAt === "number"
    ) {
      return parsed;
    }
  } catch (error) {
    console.error("Failed to parse backup scheduler lock", error);
  }

  return null;
};

const writeSchedulerLock = (value: BackupSchedulerLock) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BACKUP_SCHEDULER_LOCK_KEY, JSON.stringify(value));
};

const renewSchedulerLock = (ownerId: string) => {
  writeSchedulerLock({
    ownerId,
    expiresAt: Date.now() + BACKUP_SCHEDULER_LEASE_MS,
  });
};

const tryAcquireSchedulerLock = (ownerId: string) => {
  if (typeof window === "undefined") {
    return true;
  }

  const currentLock = readSchedulerLock();
  const now = Date.now();
  if (
    currentLock &&
    currentLock.ownerId !== ownerId &&
    currentLock.expiresAt > now
  ) {
    return false;
  }

  renewSchedulerLock(ownerId);
  const confirmedLock = readSchedulerLock();
  return confirmedLock?.ownerId === ownerId;
};

const releaseSchedulerLock = (ownerId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const currentLock = readSchedulerLock();
  if (currentLock?.ownerId === ownerId) {
    window.localStorage.removeItem(BACKUP_SCHEDULER_LOCK_KEY);
  }
};

export default function BackupScheduler() {
  const { currentUser } = useAuth();
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const ownerIdRef = useRef(createSchedulerOwnerId());

  useEffect(() => {
    if (currentUser?.role !== "admin" || !currentUser.branch) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      releaseSchedulerLock(ownerIdRef.current);
      return;
    }

    const tick = async () => {
      if (inFlightRef.current) {
        return;
      }

      if (!tryAcquireSchedulerLock(ownerIdRef.current)) {
        return;
      }

      try {
        inFlightRef.current = true;
        try {
          renewSchedulerLock(ownerIdRef.current);
          await syncBackupSnapshot();
        } catch (error) {
          console.error("Backup snapshot sync failed", error);
        }
        renewSchedulerLock(ownerIdRef.current);
        await dispatchDueAutomatedBackups();
      } catch (error) {
        console.error("Automated backup dispatch failed", error);
      } finally {
        renewSchedulerLock(ownerIdRef.current);
        inFlightRef.current = false;
      }
    };

    void tick();
    timerRef.current = window.setInterval(() => {
      void tick();
    }, BACKUP_SCHEDULER_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      releaseSchedulerLock(ownerIdRef.current);
    };
  }, [currentUser?.branch, currentUser?.role]);

  return null;
}
