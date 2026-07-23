// PR-FAQOG — explicit Twitter/X card image route.
//
// Before this file existed, Twitter cards only worked through Next's
// implicit "no twitter-image, fall back to opengraph-image" behavior.
// This makes the signal explicit (a real `twitter:image` route) without
// duplicating the agency-aware data lookup: the route re-exports the
// sibling `opengraph-image.tsx` wholesale, so agency hosts keep their
// branded card (name, tagline, talent count) and the platform apex keeps
// the "The Commerce Platform for Talent" card. Any future change to the
// OG card flows here automatically; there is nothing to keep in sync.

export { default, alt, size, contentType } from "./opengraph-image";
