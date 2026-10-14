import type { Callout } from "./engine";
import type { Lang } from "../results/copy";

/** Callout copy shows the data it fired on. No em dashes. */
export function calloutText(c: Callout, lang: Lang): { title: string; cta: string } {
  const es = lang === "es";
  switch (c.type) {
    case "cancellation":
      return { title: es ? `Se liberó tu cita de las ${c.slotLabel}` : `Your ${c.slotLabel} slot opened up`, cta: es ? "Crear promo" : "Create promo" };
    case "empty_days":
      return {
        title: es ? `${c.dayLabel}: ${c.booked} de ${c.open} horas reservadas` : `${c.dayLabel}: ${c.booked} of ${c.open} hours booked`,
        cta: es ? "Crear promo" : "Create promo",
      };
    case "lapsed_clients":
      return {
        title: es
          ? `${c.count} ${c.count === 1 ? "clienta no viene" : "clientas no vienen"} hace más de 2 meses`
          : `${c.count} ${c.count === 1 ? "client hasn't" : "clients haven't"} visited in over 2 months`,
        cta: es ? "Crear promo" : "Create promo",
      };
    case "idle_service":
      return { title: es ? `${c.serviceName}: sin reservas este mes` : `${c.serviceName}: no bookings this month`, cta: es ? "Crear promo" : "Create promo" };
  }
}
