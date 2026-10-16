"use server";

/**
 * One server action for the whole Appointments & Classes screen (TUL-701).
 *
 * The screen used to call four loaders from the browser. Next runs one
 * client's server actions one at a time, so those were a queue, and each paid
 * its own guard and its own chain of reads (25-30 s on "Cargando las citas").
 * Here the four run inside ONE request: the staff guard is shared per request
 * (`requireWorkspaceStaffActionOnce`), and the reads overlap. Each loader still
 * proves staff-of-this-tenant and still compares the tenant it was handed.
 */
import { loadAppointments, loadBookingHoursProposals, loadSessionWaitlists } from "@/lib/scheduling/appointments-actions";
import { loadSchedule } from "@/lib/sessions/schedule-actions";

export type AppointmentsSurface = {
  board: Awaited<ReturnType<typeof loadAppointments>>;
  schedule: Awaited<ReturnType<typeof loadSchedule>>;
  queue: Awaited<ReturnType<typeof loadSessionWaitlists>>;
  pending: Awaited<ReturnType<typeof loadBookingHoursProposals>>;
};

export async function loadAppointmentsSurface(
  tenantId: string,
  focusSessionId: string | null,
): Promise<AppointmentsSurface> {
  const [board, schedule, queue, pending] = await Promise.all([
    loadAppointments(tenantId),
    loadSchedule(tenantId),
    loadSessionWaitlists(tenantId, focusSessionId),
    loadBookingHoursProposals(tenantId),
  ]);
  return { board, schedule, queue, pending };
}
