import { memo, useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type DebouncedSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onTypingStart?: () => void;
  debounceMs?: number;
};

const DebouncedSearchInput = memo(function DebouncedSearchInput({
  value,
  onValueChange,
  onTypingStart,
  debounceMs = 800,
  ...inputProps
}: DebouncedSearchInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const [editRevision, setEditRevision] = useState(0);
  const onValueChangeRef = useRef(onValueChange);
  const onTypingStartRef = useRef(onTypingStart);
  const isEditingRef = useRef(false);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onTypingStartRef.current = onTypingStart;
  }, [onValueChange, onTypingStart]);

  useEffect(() => {
    if (!isEditingRef.current) return;

    const timer = window.setTimeout(() => {
      isEditingRef.current = false;
      onValueChangeRef.current(draftValue);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [draftValue, editRevision, debounceMs]);

  return (
    <input
      {...inputProps}
      value={draftValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (!isEditingRef.current) {
          isEditingRef.current = true;
          onTypingStartRef.current?.();
        }
        setDraftValue(nextValue);
        setEditRevision((revision) => revision + 1);
      }}
    />
  );
});

DebouncedSearchInput.displayName = "DebouncedSearchInput";

export default DebouncedSearchInput;
