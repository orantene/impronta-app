import { BookingStateChip, CountdownText, PaymentStateChip, TALENT_AGENDA_VARS } from "@/components/admin/shell/internal/talent/agenda/primitives";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
const HOLD_ENDS_AT = "2026-09-24T12:50:00.000Z";

/** Dev-only story page for Agenda V2 primitives (Phase 3). */
export default function TalentAgendaDevPage() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_ROUTES !== "1") {
    notFound();
  }

  return (
    <main style={TALENT_AGENDA_VARS} className="mx-auto max-w-[720px] space-y-6 p-6">
      <h1 className="text-[24px] font-semibold">Talent agenda kit</h1>
      <div className="flex flex-wrap gap-2">
        <BookingStateChip state="confirmed" />
        <BookingStateChip state="hold" />
        <BookingStateChip state="requested" />
        <PaymentStateChip state="paid" />
        <PaymentStateChip state="overdue" />
        <PaymentStateChip state="awaiting_deposit" />
      </div>
      <p className="text-[14px]">
        Hold ends in{" "}
        <CountdownText target={HOLD_ENDS_AT} />
      </p>
    </main>
  );
}
