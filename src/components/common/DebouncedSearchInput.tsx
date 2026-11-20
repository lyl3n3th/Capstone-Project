import { memo, useEffect, useRef, type InputHTMLAttributes } from "react";

type DebouncedSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
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
  const inputRef = useRef<HTMLInputElement>(null);
  const onValueChangeRef = useRef(onValueChange);
  const onTypingStartRef = useRef(onTypingStart);
  const isEditingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onTypingStartRef.current = onTypingStart;
  }, [onValueChange, onTypingStart]);

  useEffect(() => {
    if (isEditingRef.current || !inputRef.current) return;
    if (inputRef.current.value !== value) inputRef.current.value = value;
  }, [value]);

  useEffect(() => () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return (
    <input
      {...inputProps}
      ref={inputRef}
      defaultValue={value}
      onChange={(event) => {
        if (!isEditingRef.current) {
          isEditingRef.current = true;
          onTypingStartRef.current?.();
        }

        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = window.setTimeout(() => {
          debounceTimerRef.current = null;
          isEditingRef.current = false;
          onValueChangeRef.current(inputRef.current?.value ?? "");
        }, debounceMs);
      }}
    />
  );
});

DebouncedSearchInput.displayName = "DebouncedSearchInput";

export default DebouncedSearchInput;
