import { useContext, useEffect } from "react";
import { ConfirmationContext } from "../contexts/confirmation";

export function useConfirmation() {
  const controls = useContext(ConfirmationContext);
  if (!controls) {
    throw new Error("useConfirmation requires a ConfirmationProvider");
  }

  const { confirm, cancel } = controls;
  // Never allow an operation to continue after its page has unmounted.
  useEffect(() => cancel, [cancel]);
  return confirm;
}
