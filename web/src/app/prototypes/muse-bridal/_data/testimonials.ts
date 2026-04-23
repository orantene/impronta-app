/**
 * Editorial testimonials surfaced on homepage + about page.
 *
 * Field-model mapping:
 *   - quote / author / context / location / accent are all fields on a
 *     `testimonial_items` row. `accent` selects which palette pairing to
 *     apply (`blush` | `sage` | `champagne`) — becomes a theme-controlled enum.
 */

export type TestimonialAccent = "blush" | "sage" | "champagne";

export type Testimonial = {
  quote: string;
  author: string;
  context: string;
  location: string;
  accent: TestimonialAccent;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "The Muse team made three decisions a day feel like none. Our photos, our film, our florals — all in the same key.",
    author: "Priya & Dev",
    context: "Three-day celebration",
    location: "Amalfi Coast",
    accent: "blush",
  },
  {
    quote:
      "We came for a photographer and left with a whole team we trusted. That is the value — not just talent, but taste.",
    author: "Camila & Rodrigo",
    context: "Beachfront ceremony",
    location: "Tulum",
    accent: "sage",
  },
  {
    quote:
      "The house spoke to every vendor before they spoke to us. Nothing overlapped, nothing was missed.",
    author: "Valentina M.",
    context: "Private estate wedding",
    location: "Valle de Guadalupe",
    accent: "champagne",
  },
];
