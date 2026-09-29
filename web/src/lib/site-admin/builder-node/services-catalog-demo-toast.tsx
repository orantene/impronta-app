"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Demo mode: the "no real booking" notice is a short toast on a row tap, never
 * a line inside the design. `ping()` shows it for 3.5s.
 */
export function useDemoToast(enabled: boolean): { show: boolean; ping: () => void } {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const ping = useCallback(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    setShow(true);
    timer.current = setTimeout(() => setShow(false), 3500);
  }, [enabled]);
  return { show, ping };
}

export function ServicesCatalogDemoToast({ show, locale }: { show: boolean; locale: string }) {
  const es = locale.startsWith("es");
  return (
    <p className="site-builder-node--services-catalog-demo-toast" role="status" data-show={show ? "true" : "false"}>
      {show ? (es ? "Vista previa: no se crea ninguna reserva real." : "Preview: no real bookings are created.") : null}
    </p>
  );
}
