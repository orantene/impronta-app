/**
 * AUD-039 — which face the guest dock header shows on a talent vanity site.
 *
 * Design of record (Front Door Chat v2, F02/F04/F08): avatar + name + status.
 * The avatar is the site logo when she has one (contain-fit on a white circle,
 * so a wordmark is never cropped), else her profile photo (cover), else the
 * letter monogram. Agency docks keep the wordmark identity and never reach this.
 */

export type GuestHeaderAvatar =
  | { kind: "logo"; src: string }
  | { kind: "photo"; src: string }
  | { kind: "monogram"; letter: string };

export function resolveGuestHeaderAvatar(input: {
  logoUrl?: string | null;
  photoUrl?: string | null;
  name: string;
}): GuestHeaderAvatar {
  const logo = input.logoUrl?.trim();
  if (logo) return { kind: "logo", src: logo };
  const photo = input.photoUrl?.trim();
  if (photo) return { kind: "photo", src: photo };
  const letter = input.name.trim()[0]?.toUpperCase() ?? "";
  return { kind: "monogram", letter: letter || "•" };
}
