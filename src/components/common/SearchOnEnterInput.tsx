import { memo, useEffect, useRef, type InputHTMLAttributes } from "react";

type SearchOnEnterInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onTypingStart?: () => void;
};

const SearchOnEnterInput = memo(function SearchOnEnterInput({
  value,
  onValueChange,
  onTypingStart,
  ...inputProps
}: SearchOnEnterInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onValueChangeRef = useRef(onValueChange);
  const onTypingStartRef = useRef(onTypingStart);
  const isEditingRef = useRef(false);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onTypingStartRef.current = onTypingStart;
  }, [onValueChange, onTypingStart]);

  useEffect(() => {
    if (isEditingRef.current || !inputRef.current) return;
    if (inputRef.current.value !== value) inputRef.current.value = value;
  }, [value]);

  return (
    <input
      {...inputProps}
      ref={inputRef}
      defaultValue={value}
      onChange={() => {
        if (!isEditingRef.current) {
          isEditingRef.current = true;
          onTypingStartRef.current?.();
        }
      }}
      onKeyDown={(event) => {
        inputProps.onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.key !== "Enter" ||
          event.nativeEvent.isComposing
        ) return;

        event.preventDefault();
        isEditingRef.current = false;
        onValueChangeRef.current(inputRef.current?.value ?? value);
      }}
    />
  );
});

SearchOnEnterInput.displayName = "SearchOnEnterInput";

export default SearchOnEnterInput;
