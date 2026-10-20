import { useEffect, useState } from "react";
import {
  EVALUATION_PERIOD_UPDATED_EVENT, fetchEvaluationPeriod,
  isEvaluationPeriodOpen, readEvaluationPeriod,
} from "../services/evaluationPeriod";

export const useEvaluationPeriod = (branch?: string | null) => {
  const [period, setPeriod] = useState(() => readEvaluationPeriod(branch));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    let request = 0;
    setPeriod(readEvaluationPeriod(branch));
    setIsLoading(true);
    setError("");
    const refresh = async () => {
      const currentRequest = ++request;
      try {
        const latest = await fetchEvaluationPeriod(branch);
        if (active && currentRequest === request) {
          setPeriod(latest);
          setError("");
        }
      } catch (failure) {
        if (active && currentRequest === request) {
          setError(failure instanceof Error ? failure.message : "Unable to load evaluation access.");
        }
      } finally {
        if (active && currentRequest === request) setIsLoading(false);
      }
    };
    const sync = () => { void refresh(); };
    sync();
    const refreshTimer = window.setInterval(sync, 30_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(EVALUATION_PERIOD_UPDATED_EVENT, sync);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVALUATION_PERIOD_UPDATED_EVENT, sync);
    };
  }, [branch]);

  return { period, setPeriod, isLoading, error, isOpen: !isLoading && !error && isEvaluationPeriodOpen(period, now) };
};
