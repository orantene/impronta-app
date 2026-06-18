/**
 * Shared types for the "Edit job" sheet (loader result + patch shapes).
 *
 * These live in a PLAIN module - NOT in `_pipeline-actions.ts` - because that
 * file is "use server", and a "use server" module must export only async
 * functions. A client component (EditJobSheet) importing a type from a
 * "use server" file makes the server-action transform emit a runtime reference
 * to the erased type, which throws at module evaluation and poisons the whole
 * client chunk (here: the entire Messages inbox + thread went blank). Keeping
 * the types here lets both the actions and the client import them safely.
 */

export type EditableInquiryJobFields = {
  version: number;
  status: string;
  isFrozen: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  company: string | null;
  eventTypeId: string | null;
  quantity: number | null;
  message: string | null;
  eventDate: string | null;
  eventTimezone: string | null;
  deadlineAt: string | null;
  eventLocation: string | null;
  wardrobeNotes: string | null;
  equipmentNotes: string | null;
  transportNotes: string | null;
  lodgingNotes: string | null;
  mealsNotes: string | null;
  accessNotes: string | null;
};

export type EditableBookingJobFields = {
  bookingId: string;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  eventDate: string | null;
  timezone: string | null;
  deadlineAt: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueLocationText: string | null;
  notes: string | null;
  internalNotes: string | null;
  paymentNotes: string | null;
  wardrobeNotes: string | null;
  equipmentNotes: string | null;
  transportNotes: string | null;
  lodgingNotes: string | null;
  mealsNotes: string | null;
  accessNotes: string | null;
};

export type EditJobEventTypeOption = { id: string; label: string };

export type EditJobFieldData = {
  inquiry: EditableInquiryJobFields;
  /** Present only when the inquiry has converted to a booking. */
  booking: EditableBookingJobFields | null;
  eventTypes: EditJobEventTypeOption[];
};

export type BookingJobFieldsPatch = {
  title?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  event_date?: string | null;
  timezone?: string | null;
  deadline_at?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  venue_location_text?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  payment_notes?: string | null;
  wardrobe_notes?: string | null;
  equipment_notes?: string | null;
  transport_notes?: string | null;
  lodging_notes?: string | null;
  meals_notes?: string | null;
  access_notes?: string | null;
};
