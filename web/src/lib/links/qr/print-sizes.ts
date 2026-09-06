/**
 * The fixed physical print sizes, as PURE DATA — no `server-only`, no pdf-lib,
 * no sharp. Split out of `./files.ts` (which is `import "server-only"` for the
 * PDF/PNG rendering) so client code — the print builder's artboard sizing
 * (`buildPrintComposition`) — can read the mm dimensions without dragging the
 * server-only QR renderer into the client bundle. `files.ts` re-exports these,
 * so its existing API is unchanged.
 */

export type PrintSize = { label: string; widthMm: number; heightMm: number };

/** The sizes the Share popover offers. Table tent first: it is the common case. */
export const PRINT_SIZES = {
  table_tent: { label: "Table tent", widthMm: 100, heightMm: 150 },
  a5: { label: "A5 flyer", widthMm: 148, heightMm: 210 },
  a4: { label: "A4 poster", widthMm: 210, heightMm: 297 },
  sticker: { label: "Sticker", widthMm: 50, heightMm: 50 },
  card: { label: "Business card", widthMm: 85, heightMm: 55 },
} as const satisfies Record<string, PrintSize>;

export type PrintSizeKey = keyof typeof PRINT_SIZES;
