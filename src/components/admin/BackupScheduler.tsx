import { useEffect, useRef } from "react";
import { useAuth } from "../../hooks/useAuth";
import { createManualBackup, fetchBackupSettings } from "../../services/backupApi";

const AUTO_BACKUP_PREFIX = "aics-auto-backup-last-run";

export default function BackupScheduler() {
  const { currentUser } = useAuth();
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (currentUser?.role !== "admin" || !currentUser.branch) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const branch = currentUser.branch;

    const tick = async () => {
      if (inFlightRef.current) {
        return;
      }

      try {
        inFlightRef.current = true;
        const settings = await fetchBackupSettings();
        if (!settings.is_enabled) {
          return;
        }

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const scheduledTime = settings.automated_time.slice(0, 5);
        const todayKey = `${AUTO_BACKUP_PREFIX}:${branch}:${scheduledTime}:${now.toISOString().slice(0, 10)}`;

        if (currentTime !== scheduledTime || localStorage.getItem(todayKey)) {
          return;
        }

        await createManualBackup({ backupType: "automated" });
        localStorage.setItem(todayKey, now.toISOString());
      } catch (error) {
        console.error("Automated backup check failed", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    void tick();
    timerRef.current = window.setInterval(() => {
      void tick();
    }, 30000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentUser?.branch, currentUser?.role]);

  return null;
}
