import type { KeyboardEvent, ReactNode } from "react";

/**
 * Props for a radio that can be turned off again: clicking (or pressing Space on)
 * the selected option clears it, so optional questions don't trap an answer.
 */
export function toggleRadio(checked: boolean, select: () => void, clear: () => void) {
  return {
    checked,
    onChange: select,
    onClick: () => {
      if (checked) clear();
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== " " || !checked) return;
      event.preventDefault();
      clear();
    },
  };
}

/** A button-styled label around a hidden image file input. */
export function PhotoPicker({
  className,
  onFile,
  children,
}: {
  className: string;
  onFile: (file: File) => void;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      {children}
      <input
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) onFile(file);
        }}
      />
    </label>
  );
}
