import type { HelpEntry } from "./help-registry";

/**
 * Help for the scheduling surfaces, which the assistant did not know existed.
 *
 * A workspace owner asked the in-product assistant "how i create an event" and
 * was told: "In Tulala there isn't a feature called 'event' exactly", followed
 * by New Inquiry and New Booking — the talent-agency shoot workflow, to a
 * business that does not run shoots.
 *
 * Both halves were wrong. `/admin/events` is a 680-line surface with an event
 * list and seven per-event tabs; `/admin/sessions` runs real series and
 * occurrences; `/admin/reservations` is live. The assistant grounds on
 * DRAWER_HELP, which is keyed by DRAWER ids, and these are PAGES — so no entry
 * existed and the model answered from the agency-era entries that did.
 *
 * They live in their own module because help-registry.ts sits exactly on its
 * 1982-line ratchet budget, and the house rule is to trim waste rather than
 * raise a budget. `help-corpus.ts` merges them.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED HERE: selling tickets. Ticketing is not
 * shipped — it waits on an `admissions` table that does not exist in
 * production — and the last time this corpus oversold an unshipped feature it
 * cost a real customer a real answer.
 */
export const SCHEDULING_HELP: Record<string, HelpEntry> = {
  events: {
    audience: ["Workspace admin", "Workspace coordinator"],
    category: "Operations",
    purpose:
      "One event, from the idea to the door. The list shows every event you have; opening one gives you its details, its sessions, seating, lineup and sales.",
    youCanHere: [
      "Create an event and move it between draft, published and closed",
      "Give it sessions, so one event can run on several nights",
      "Attach seating when the room has a layout",
      "Watch sales against it",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "Where is it? I cannot see it in the sidebar.",
        a: "Open it directly at /admin/events. The page is built and works; the sidebar entry is a deferred follow-up, so today the URL is the way in.",
      },
      {
        q: "Can I sell tickets to it?",
        a: "Not yet. Selling admissions is still being built, so an event can be planned and run but not ticketed. Reservations and session seats are the two ways to hold places today.",
      },
      {
        q: "What is the difference between an event and a session?",
        a: "An event is the thing people come to; a session is one occurrence of it. A class that runs every Tuesday is one series of sessions. A two-night show is one event with two sessions.",
      },
    ],
  },
  sessions: {
    audience: ["Workspace admin", "Workspace coordinator"],
    category: "Operations",
    purpose:
      "Your schedule: recurring series and the individual occurrences they generate. This is where a class, a course or anything that repeats actually lives.",
    youCanHere: [
      "Create a series and let it generate its occurrences",
      "Edit one occurrence without disturbing the rest of the series",
      "Cap how many people a session can take",
      "See who was refused when a session filled up",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "How do I set up a weekly class?",
        a: "Create a series in the Schedule, give it its day and time, and the occurrences are generated from it. You edit a single date on its own occurrence, so moving one week does not move the others.",
      },
      {
        q: "What happens when a session is full?",
        a: "The seat limit is enforced when somebody takes the last place, so a session cannot be oversold. The refusal is recorded rather than silently dropped.",
      },
    ],
  },
  reservations: {
    audience: ["Workspace admin", "Workspace coordinator"],
    category: "Operations",
    purpose:
      "The host stand: who is coming, when, and for how many. Built for a room with tables rather than a calendar of appointments.",
    youCanHere: [
      "See a day's bookings and walk-ins in one list",
      "Set the hours you take reservations, per service",
      "Take a deposit so a no-show costs something",
      "Hold a party size against a table rather than a time slot",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "Is this the same as Appointments?",
        a: "No. Appointments book a person's time; reservations book a place in a room. A salon chair is an appointment, a table for four is a reservation.",
      },
      {
        q: "Can guests book from my own page?",
        a: "Yes, once the reservation block is on the page. Guests see the times you have open for that service and book directly.",
      },
    ],
  },
};
