/**
 * Phase C — checked-in marker round-trip fixtures.
 *
 * Per the migration-pass plan §8 + the user's ratified answer to
 * fixture-source: deterministic, repository-checked, no live DB
 * dependency in CI. Covers every shape the production grammar can
 * produce, plus a handful of sanitized real-world strings.
 *
 * If you find a real production string that breaks round-trip, sanitize
 * it (no PII, no tenant-identifying URLs) and add it here. This file
 * is the spec.
 */

export const ROUND_TRIP_FIXTURES: ReadonlyArray<string> = [
  // Empty + plain text
  "",
  "Hello world",
  "  leading and trailing whitespace  ",
  "single",
  "punctuation. ends. with. periods.",
  "Em-dashes — and en–dashes",
  "Quotes \"like these\" and 'these'",
  "Unicode: café, résumé, naïve, 北京",

  // Each marker in isolation
  "{accent}only accent{/accent}",
  "{b}only bold{/b}",
  "{i}only italic{/i}",
  "[only link](https://example.com)",

  // Marker at start
  "{accent}Welcome{/accent} to the site.",
  "{b}Bold{/b} start of line.",
  "{i}Italic{/i} start.",
  "[Link](https://example.com) start.",

  // Marker at end
  "End with {accent}accent{/accent}",
  "End with {b}bold{/b}",
  "End with {i}italic{/i}",
  "End with [link](https://example.com)",

  // Marker mid-string
  "Some {accent}emphasis{/accent} here.",
  "Then {b}stronger{/b} mid-line.",
  "And {i}lighter{/i} touch.",
  "Read more [in the docs](https://example.com/docs) today.",

  // Multiple markers
  "{accent}Impronta{/accent} and {b}team{/b}.",
  "{accent}A{/accent} {b}B{/b} {i}C{/i} {accent}D{/accent}",
  "Click {b}here{/b} or [there](https://example.com/x).",

  // Whitespace inside markers (preserved)
  "{accent} padded {/accent}",
  "{b} bold space {/b}",
  "{i}\tab inside\t{/i}",

  // Adjacent markers (no whitespace between)
  "{accent}A{/accent}{b}B{/b}",
  "{b}bold{/b}{i}italic{/i}",

  // Punctuation immediately after marker
  "{accent}highlighted{/accent}.",
  "{accent}highlighted{/accent}, more text.",
  "End in {b}bold{/b}!",

  // URLs with query strings + paths
  "Read [docs](https://example.com/path?a=1&b=2) for details.",
  "Email at [contact](mailto:hello@example.com) or call.",
  "Anchor [section](#section-2) reference.",
  "Relative [page](/about) link.",

  // Long-ish realistic strings (sanitized real-world shapes)
  "Welcome to {accent}Impronta{/accent} — book your {b}team{/b} in minutes.",
  "Quiet, unhurried, always in the {accent}same key{/accent}.",
  "Our {accent}featured talent{/accent} this season.",
  "Tell us about your {b}celebration{/b}.",
  "Contact us at [hello@example.com](mailto:hello@example.com).",
  "The {accent}difference{/accent} is in the {b}details{/b} — see [our work](/work).",

  // Multi-paragraph (newlines preserved)
  "First paragraph.\nSecond paragraph.",
  "Line one.\n\nLine two with {b}bold{/b}.",

  // Edge: marker-like text that isn't a real marker
  "Code sample: { not a marker }",
  "Math: {x | x > 0}",
  "Single brace { in text",
];

/**
 * Ghost-marker collapse cases. These are NOT round-trip identity —
 * they're inputs where empty markers should serialize to no output at
 * all. Per migration-pass plan §6 rule 4.
 */
export const GHOST_MARKER_FIXTURES: ReadonlyArray<[string, string]> = [
  ["{accent}{/accent}", ""],
  ["{b}{/b}", ""],
  ["{i}{/i}", ""],
  ["leading{accent}{/accent}trailing", "leadingtrailing"],
  ["a{b}{/b}b{i}{/i}c", "abc"],
];
