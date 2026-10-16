/**
 * TUL-1082: WAI-ARIA tabs keyboard path for the dock bottom bar. Arrow keys
 * wrap, Home/End jump; null means "not a tab key, let it through".
 */
export function nextDockTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const from = current < 0 ? 0 : current;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (from + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (from - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
