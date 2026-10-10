/**
 * Desktop marketing nav menus: hover opens, click pins (sticky).
 *
 * Without a sticky pin, hover-open + click runs `onToggle` which CLOSES the
 * menu — QA (live4-02) reads that as "click does nothing". Touch also fires
 * synthetic mouseleave after open; sticky keeps the panel open until the
 * second click, Escape, or outside pointer.
 */
import { useEffect, useState } from "react";

export function useStickyDesktopMenu(
  open: boolean,
  onOpen: () => void,
  onClose: () => void,
): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
} {
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    if (!open) setSticky(false);
  }, [open]);

  return {
    onMouseEnter: onOpen,
    onMouseLeave: () => {
      if (!sticky) onClose();
    },
    onClick: () => {
      if (sticky) {
        setSticky(false);
        onClose();
      } else {
        setSticky(true);
        onOpen();
      }
    },
  };
}
