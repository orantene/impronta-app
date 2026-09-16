/** service_collection — cards with "from $" and Book; the CTA opens `appointment_picker` with the service preselected. */

export type ServiceCollectionProps = {
  serviceIds?: string[] | "all";
  layout?: "cards" | "list";
  showFromPrice?: boolean;
  locale?: string | null;
};

export type ServiceCard = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  /** The lowest price across options; null = on request. */
  fromCents: number | null;
  currency: string;
  priceDisplay: "exact" | "from" | "quote";
  /** `instant` opens the picker; anything else opens the inquiry form. */
  bookingMode: "instant" | "request" | "inquire";
  personId: string | null;
  category: string | null;
  seatsLabel: string | null;
};

export type ServiceCollectionData = { services: ServiceCard[]; layout: "cards" | "list" };
