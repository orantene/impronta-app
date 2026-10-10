"use client";

type BackNavStep = "choose" | "when" | "who" | "done";

/** When/who back links for the catalog booking sheet (split out for max-lines). */
export function CatalogBookingBackNav({
  step,
  es,
  onChangeService,
  onChangeTime,
  onStartOver,
}: {
  step: BackNavStep;
  es: boolean;
  onChangeService: () => void;
  onChangeTime: () => void;
  onStartOver: () => void;
}) {
  if (step !== "when" && step !== "who") return null;
  return (
    <nav className="jb-back-nav" aria-label={es ? "Navegación de la reserva" : "Booking navigation"}>
      {step === "when" ? (
        <button
          type="button"
          className="jb-back-link"
          data-catalog-change-service=""
          onClick={onChangeService}
        >
          {es ? "← Cambiar servicio u opciones" : "← Change service or options"}
        </button>
      ) : (
        <button
          type="button"
          className="jb-back-link"
          data-catalog-change-time=""
          onClick={onChangeTime}
        >
          {es ? "← Cambiar horario" : "← Change time"}
        </button>
      )}
      <button type="button" className="jb-back-link" data-catalog-start-over="" onClick={onStartOver}>
        {es ? "Empezar de nuevo" : "Start over"}
      </button>
    </nav>
  );
}
