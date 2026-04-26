"use client";

/**
 * Phase 10 — AltTextField primitive.
 *
 * Pairs with any image input (URL or MediaPicker). Required by default;
 * shows an inline warning chip when the alt is empty AND the linked image
 * URL is set, so the operator sees the missing-alt state at a glance.
 *
 * Decorative images can opt out by passing `decorative` — the field is
 * disabled, the value is forced to `""`, and the lint pill switches to a
 * neutral "decorative" badge.
 */

interface AltTextFieldProps {
  imageUrl: string | null | undefined;
  value: string;
  onChange: (next: string) => void;
  /** Mark the image as decorative — disables the field + suppresses warning. */
  decorative?: boolean;
  onDecorativeChange?: (next: boolean) => void;
  className?: string;
}

const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function AltTextField({
  imageUrl,
  value,
  onChange,
  decorative = false,
  onDecorativeChange,
  className,
}: AltTextFieldProps) {
  const hasImage = Boolean(imageUrl && imageUrl.trim());
  const missing = hasImage && !decorative && !value.trim();

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Alt text {decorative ? "" : "*"}
        </label>
        <div className="flex items-center gap-2">
          {missing ? (
            <span
              className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
              title="Screen-readers rely on alt text. Required for non-decorative images."
            >
              Missing
            </span>
          ) : decorative ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Decorative
            </span>
          ) : hasImage ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              OK
            </span>
          ) : null}
          {onDecorativeChange ? (
            <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={decorative}
                onChange={(e) => {
                  onDecorativeChange(e.target.checked);
                  if (e.target.checked) onChange("");
                }}
              />
              decorative
            </label>
          ) : null}
        </div>
      </div>
      <input
        type="text"
        className={INPUT}
        maxLength={200}
        disabled={decorative}
        placeholder={
          decorative
            ? "(Decorative — alt empty)"
            : "Describe what's in the image"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={missing || undefined}
      />
    </div>
  );
}
