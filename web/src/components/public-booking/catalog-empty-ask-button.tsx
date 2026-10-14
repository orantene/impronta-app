"use client";

/** Empty-slot escape hatch: opens the ask chat so the guest can request a time. */
export function CatalogEmptyAskButton({ es, onAsk }: { es: boolean; onAsk: () => void }) {
  return (
    <button type="button" className="jb-ask" data-catalog-empty-ask="" onClick={() => onAsk()}>
      {es ? "Solicitar un horario" : "Request a time"}
    </button>
  );
}
