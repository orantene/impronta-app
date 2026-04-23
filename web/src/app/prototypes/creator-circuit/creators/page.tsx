import { Eyebrow } from "../_components/Eyebrow";
import { Reveal } from "../_components/Reveal";
import { CREATORS } from "../_data/creators";
import { DirectoryClient } from "./DirectoryClient";

export const metadata = {
  title: "Creators",
};

export default function DirectoryPage() {
  return (
    <section
      style={{
        paddingTop: 120,
        paddingBottom: "clamp(64px, 8vw, 120px)",
      }}
    >
      <div className="cc-shell">
        <div
          className="cc-section-head"
          style={{ marginBottom: "clamp(28px, 4vw, 48px)" }}
        >
          <Reveal>
            <Eyebrow tone="accent">Creator directory</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h1
              className="cc-section-title"
              style={{ fontSize: "clamp(38px, 5vw, 68px)" }}
            >
              Discover creators by <em>niche, format, and audience</em>.
            </h1>
          </Reveal>
          <Reveal delay={2}>
            <p className="cc-section-sub">
              Filter the full roster by creator type, platform, audience size, deliverable,
              and niche — or search by name, handle, or market.
            </p>
          </Reveal>
        </div>

        <DirectoryClient creators={CREATORS} />
      </div>
    </section>
  );
}
