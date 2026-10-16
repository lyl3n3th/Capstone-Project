import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import ConfirmationModal from "../components/common/ConfirmationModal";
import { ConfirmationContext } from "./confirmation";
import type { ConfirmationOptions } from "./confirmation";

interface ConfirmationRequest extends ConfirmationOptions {
  message: string;
}

export default function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const cancel = useCallback(() => finish(false), [finish]);
  const confirm = useCallback((message: string, options: ConfirmationOptions) => {
    // Ignore repeated clicks while a confirmation is already open.
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setRequest({ message, ...options });
    });
  }, []);

  useEffect(() => () => {
    pending.current?.(false);
    pending.current = null;
  }, []);

  const controls = useMemo(() => ({ confirm, cancel }), [confirm, cancel]);

  return (
    <ConfirmationContext.Provider value={controls}>
      {children}
      {request && (
        <ConfirmationModal
          {...request}
          onCancel={cancel}
          onConfirm={() => finish(true)}
        />
      )}
    </ConfirmationContext.Provider>
  );
}
