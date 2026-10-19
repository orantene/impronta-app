/**
 * GRK-109 front-door guard: Choose is gated on the resume lookup, so the gate
 * must open on EVERY path (success, rejection, slow). A late result is still
 * delivered; the reducer ignores it once a choice exists. Returns a cancel.
 */
export function runResumeLookup<T>({
  load,
  onChecked,
  onLoaded,
  timeoutMs = 3000,
}: {
  load: () => Promise<T>;
  onChecked: () => void;
  onLoaded: (value: T) => void;
  timeoutMs?: number;
}): () => void {
  let cancelled = false;
  let checked = false;
  const check = () => {
    if (cancelled || checked) return;
    checked = true;
    onChecked();
  };
  const timer = setTimeout(() => {
    check();
  }, timeoutMs);
  load().then(
    (value) => {
      clearTimeout(timer);
      if (cancelled) return;
      check();
      onLoaded(value);
    },
    () => {
      clearTimeout(timer);
      check();
    },
  );
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
