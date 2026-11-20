import { memo, useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type DebouncedSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  debounceMs?: number;
};

const DebouncedSearchInput = memo(function DebouncedSearchInput({
  value,
  onValueChange,
  debounceMs = 400,
  ...inputProps
}: DebouncedSearchInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const onValueChangeRef = useRef(onValueChange);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    if (!draftValue.trim() || draftValue === value) return;

    const timer = window.setTimeout(() => {
      onValueChangeRef.current(draftValue);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [draftValue, value, debounceMs]);

  return (
    <input
      {...inputProps}
      value={draftValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraftValue(nextValue);
        if (!nextValue.trim()) onValueChangeRef.current("");
      }}
    />
  );
});

DebouncedSearchInput.displayName = "DebouncedSearchInput";

export default DebouncedSearchInput;
