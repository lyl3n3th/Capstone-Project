import { createContext } from "react";

export interface ConfirmationOptions {
  title: string;
  confirmLabel: string;
  destructive?: boolean;
}

export interface ConfirmationControls {
  confirm: (message: string, options: ConfirmationOptions) => Promise<boolean>;
  cancel: () => void;
}

export const ConfirmationContext = createContext<ConfirmationControls | null>(null);
