import Link from "next/link";

import { BASE } from "../_data/nav";
import { IconArrowUpRight } from "./icons";
import { Reveal } from "./Reveal";

export function SectionSplit() {
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <Reveal>
          <div className="cc-split">
            <Link href={`${BASE}/for-brands`} className="cc-split__panel cc-split__panel--brands">
              <span className="cc-split__kicker">For Brands &amp; Agencies</span>
              <h3 className="cc-split__title">
                Creators who fit the brief — and the brand.
              </h3>
              <p style={{ fontSize: 14, maxWidth: 360 }}>
                Curated discovery, media-kit profiles, campaign-ready workflow. Built for
                growth, brand, and social teams that need more than random outreach.
              </p>
              <ul className="cc-split__list">
                <li>48-hour shortlists</li>
                <li>Media-kit-first profiles</li>
                <li>Inquiry &amp; booking in one flow</li>
                <li>Post-campaign reporting</li>
              </ul>
              <span
                className="cc-btn cc-btn--light cc-btn--sm"
                style={{ alignSelf: "flex-start" }}
              >
                Explore for brands <IconArrowUpRight size={14} />
              </span>
            </Link>

            <Link
              href={`${BASE}/for-creators`}
              className="cc-split__panel cc-split__panel--creators"
            >
              <span className="cc-split__kicker">For Creators</span>
              <h3 className="cc-split__title">
                A premium roster built around your craft.
              </h3>
              <p style={{ fontSize: 14, maxWidth: 360 }}>
                Creator Circuit is invite-first. We bring you campaigns worth saying yes to —
                and handle the chaos so you can focus on the content.
              </p>
              <ul className="cc-split__list">
                <li>Campaign-fit matching only</li>
                <li>Cleaner briefs, quicker turnarounds</li>
                <li>Premium brands, real budgets</li>
                <li>Rep-grade profile + analytics</li>
              </ul>
              <span
                className="cc-btn cc-btn--light cc-btn--sm"
                style={{ alignSelf: "flex-start" }}
              >
                Join the Circuit <IconArrowUpRight size={14} />
              </span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
