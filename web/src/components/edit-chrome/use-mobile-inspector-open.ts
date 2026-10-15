import { useEffect } from "react";

import { MOBILE_INSPECTOR_OPEN_EVENT } from "./command-dock";

/**
 * Phone: the command rail (a separate element) asks the inspector dock to slide
 * in after a tab is picked; without this the panel opens inside a closed wrapper.
 */
export function useMobileInspectorOpen(onOpen: () => void): void {
  useEffect(() => {
    window.addEventListener(MOBILE_INSPECTOR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MOBILE_INSPECTOR_OPEN_EVENT, onOpen);
  }, [onOpen]);
}
