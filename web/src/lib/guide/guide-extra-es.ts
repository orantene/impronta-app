/**
 * Spanish copy for Guide nodes that are defined in code (adhoc-nodes.ts) and
 * not yet in the `dashboard.adminHelp.*` message catalog. `guide-i18n.ts`
 * uses it as the Spanish fallback, so a catalog key added later still wins.
 * One entry per node id.
 */
export type GuideExtraEs = { title: string; purpose: string; steps: readonly string[] };

export const GUIDE_EXTRA_ES: Readonly<Record<string, GuideExtraEs>> = {
  "talent-schedule-hours": {
    title: "Horario y disponibilidad",
    purpose:
      "Tu horario son los días y las horas en que te pueden reservar; los clientes solo ven espacios dentro de él, así que defínelo una vez y mantenlo al día.",
    steps: [
      "Abre Disponibilidad y define las horas en que trabajas cada día de la semana",
      "Bloquea fechas por viajes, feriados o descanso para que nadie pueda reservarlas",
      "Revisa tu calendario antes de aceptar una solicitud y cambia tu horario cuando cambie tu semana",
    ],
  },
};
