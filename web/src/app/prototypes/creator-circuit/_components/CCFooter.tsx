import Link from "next/link";

import { BASE } from "../_data/nav";
import { IconArrowUpRight } from "./icons";

const FOOTER_LINKS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Discover",
    links: [
      { label: "All Creators", href: `${BASE}/creators` },
      { label: "Categories", href: `${BASE}/creators?view=categories` },
      { label: "UGC Creators", href: `${BASE}/creators?type=ugc` },
      { label: "Influencers", href: `${BASE}/creators?type=influencer` },
    ],
  },
  {
    heading: "For Brands",
    links: [
      { label: "How it works", href: `${BASE}/for-brands#how` },
      { label: "Campaign types", href: `${BASE}/for-brands#campaigns` },
      { label: "Start a Campaign", href: `${BASE}/contact` },
    ],
  },
  {
    heading: "For Creators",
    links: [
      { label: "Join the Circuit", href: `${BASE}/for-creators` },
      { label: "What we look for", href: `${BASE}/for-creators#fit` },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: `${BASE}/about` },
      { label: "Contact", href: `${BASE}/contact` },
    ],
  },
];

export function CCFooter() {
  return (
    <footer className="cc-footer">
      <div className="cc-shell">
        <h2 className="cc-footer__brand">
          Curated creators for premium, social-first campaigns.
        </h2>

        <div className="cc-footer__grid">
          <div>
            <Link
              href={`${BASE}/contact`}
              className="cc-btn cc-btn--light cc-btn--lg"
              style={{ marginTop: 12 }}
            >
              Start a Campaign <IconArrowUpRight size={16} />
            </Link>
          </div>
          {FOOTER_LINKS.map((col) => (
            <div key={col.heading} className="cc-footer__col">
              <h4>{col.heading}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="cc-footer__legal">
          <span>© 2026 Creator Circuit — a prototype brand.</span>
          <span>Built for demo purposes. Not a real marketplace.</span>
        </div>
      </div>
    </footer>
  );
}
