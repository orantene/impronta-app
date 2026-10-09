import type { ServiceAddressErrorCode } from "@/lib/scheduling/service-address";

/** TUL-436: en + es copy for the service address field. No em dashes. */
export type ServiceAddressCopy = {
  addressLabel: string;
  addressPlaceholder: string;
  noteLabel: string;
  notePlaceholder: string;
  privacy: string;
  errors: Record<ServiceAddressErrorCode, string>;
};

const EN: ServiceAddressCopy = {
  addressLabel: "Service address",
  addressPlaceholder: "Street, number, neighborhood, city",
  noteLabel: "Access note (optional)",
  notePlaceholder: "Floor, gate code, how to find you",
  privacy: "Only your provider sees this address",
  errors: {
    address_required: "Enter the address where the service will happen.",
    address_too_short: "The address looks too short. Add the street and number.",
    address_too_long: "The address is too long (200 characters at most).",
    note_too_long: "The note is too long (120 characters at most).",
  },
};

const ES: ServiceAddressCopy = {
  addressLabel: "Dirección del servicio",
  addressPlaceholder: "Calle, número, colonia, ciudad",
  noteLabel: "Nota de acceso (opcional)",
  notePlaceholder: "Piso, código de portón, cómo encontrarte",
  privacy: "Solo tu profesional ve esta dirección",
  errors: {
    address_required: "Escribe la dirección donde será el servicio.",
    address_too_short: "La dirección parece muy corta. Agrega la calle y el número.",
    address_too_long: "La dirección es muy larga (máximo 200 caracteres).",
    note_too_long: "La nota es muy larga (máximo 120 caracteres).",
  },
};

export const SERVICE_ADDRESS_COPY = { en: EN, es: ES } as const;

export function serviceAddressCopy(locale?: string | null): ServiceAddressCopy {
  return (locale ?? "es").toLowerCase().startsWith("en") ? EN : ES;
}
