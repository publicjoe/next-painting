import { useRef, useState } from 'react';

interface InlineEditTextProps {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
  /** Called after a commit or cancel, e.g. to leave an "editing" mode. */
  onFinish?: () => void;
}

// Keeps a local draft and only commits the trimmed value on blur or Enter.
// Escape reverts; an empty draft falls back to the previous name (or "Untitled").
export function InlineEditText({
  value,
  onCommit,
  ariaLabel,
  className,
  autoFocus,
  onFinish,
}: InlineEditTextProps) {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const cancelled = useRef(false);

  // Resync the draft when the stored value changes from outside (e.g. an import).
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(value);
  }

  const finish = () => {
    if (cancelled.current) {
      setDraft(value);
    } else {
      const next = draft.trim() || value.trim() || 'Untitled';
      setDraft(next);
      if (next !== value) onCommit(next);
    }
    cancelled.current = false;
    onFinish?.();
  };

  return (
    <input
      type="text"
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
