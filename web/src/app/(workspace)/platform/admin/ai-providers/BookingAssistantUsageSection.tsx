import { loadBookingAssistantUsageByTalent } from "@/lib/ai/booking-assistant/usage-admin.server";
import { formatAssistantCents } from "@/lib/ai/booking-assistant/usage-format";

/** Read-only: this month's booking-assistant spend per talent versus the plan cap. */
export async function BookingAssistantUsageSection() {
  const rows = await loadBookingAssistantUsageByTalent();
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-white">
      <h2 className="text-[15px] font-semibold">Booking assistant usage (this month)</h2>
      <p className="mt-1 text-[12.5px] text-white/60">
        Spend per talent against the plan cap. Read-only; caps are set by plan.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-white/60">No booking-assistant spend yet this month.</p>
      ) : (
        <table className="mt-3 w-full text-left text-[13px]">
          <thead className="text-white/60">
            <tr>
              <th className="py-1 pr-3 font-medium">Talent</th>
              <th className="py-1 pr-3 font-medium">Spent</th>
              <th className="py-1 pr-3 font-medium">Cap</th>
              <th className="py-1 pr-3 font-medium">Remaining</th>
              <th className="py-1 font-medium">Used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.talentProfileId} className="border-t border-white/10">
                <td className="py-1.5 pr-3">{r.displayName}</td>
                <td className="py-1.5 pr-3">{formatAssistantCents(r.usage.usedCents)}</td>
                <td className="py-1.5 pr-3">{formatAssistantCents(r.usage.capCents)}</td>
                <td className="py-1.5 pr-3">{formatAssistantCents(r.usage.remainingCents)}</td>
                <td className="py-1.5">{r.usage.percentUsed}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
