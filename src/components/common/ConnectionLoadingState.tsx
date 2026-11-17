import { useEffect, useState } from "react";

interface ConnectionLoadingStateProps {
  message: string;
}

export default function ConnectionLoadingState({
  message,
}: ConnectionLoadingStateProps) {
  const [isTakingLong, setIsTakingLong] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsTakingLong(true), 12_000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <main
      className="auth-connection-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="auth-connection-spinner" aria-hidden="true" />
      <p>
        {isTakingLong
          ? "This is taking longer than usual. The system may be temporarily unavailable. Please wait a moment, then refresh the page if it remains here."
          : message}
      </p>
    </main>
  );
}
