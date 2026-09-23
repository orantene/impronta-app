"use client";

/**
 * MaisonChrome — the template's two small client islands.
 *
 *   MaisonHeader — sticky header. Gains a hairline and a reading-progress line
 *                  once the page scrolls. One primary action, nothing competing.
 *   MaisonMotion — the motion runtime. It ARMS the reveal CSS by adding
 *                  `.mn-armed` to the template root and then reveals each
 *                  `[data-mn-reveal]` as it enters the viewport.
 *
 * Why arming matters: the reveal rules only hide an element once `.mn-armed`
 * is on the root, and only this component sets it. So with JavaScript broken,
 * disabled, or still loading, every section renders visible — the page can
 * never be blanked by its own animation. Reduced-motion users get the same
 * arming with the transitions collapsed by the stylesheet, plus this component
 * shows everything immediately rather than waiting on the observer.
 */

import Image from "next/image";
import { useEffect, useState } from "react";

export type MaisonNavLink = { href: string; label: string };

/**
 * The wordmark, set the way her uniform reads it: the two words in display
 * italic with a small pink heart between them. Shared by the header and the
 * footer so the identity is drawn once.
 */
export function MaisonWordmark({
  lead,
  accent,
  imageUrl,
  ratio,
}: {
  lead: string;
  accent: string;
  imageUrl?: string | null;
  ratio?: number | null;
}) {
  if (imageUrl) {
    const r = ratio && ratio > 0 ? ratio : 3;
    return (
      <Image
        className="mn-mark"
        src={imageUrl}
        alt={`${lead} ${accent}`.trim()}
        width={Math.round(58 * r)}
        height={58}
        // 95, not 100: next.config's images.qualities allows [75, 85, 95] and
        // an unlisted value warns on every request. The wordmark is a small
        // flat PNG, so the difference is invisible and the warning is not.
        quality={95}
        priority
      />
    );
  }
  return (
    <>
      <em>{lead}</em>
      {accent ? (
        <>
          <svg className="mn-heart" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
            <path
              d="M12 21S1.8 14.6 1.8 7.9C1.8 4.3 4.6 1.6 8 1.6c2.1 0 3.4 1 4 2 .6-1 1.9-2 4-2 3.4 0 6.2 2.7 6.2 6.3C22.2 14.6 12 21 12 21Z"
              fill="currentColor"
            />
          </svg>
          <em>{accent}</em>
        </>
      ) : null}
    </>
  );
}

export function MaisonHeader({
  wordmarkLead,
  wordmarkAccent,
  wordmarkImageUrl,
  wordmarkImageRatio,
  links,
  cta,
  localeSwitch,
}: {
  wordmarkLead: string;
  wordmarkAccent: string;
  wordmarkImageUrl?: string | null;
  wordmarkImageRatio?: number | null;
  links: MaisonNavLink[];
  cta: React.ReactNode;
  /** Slot for the caller's own language switch. Hidden when not supplied. */
  localeSwitch?: React.ReactNode;
}) {
  const [stuck, setStuck] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setStuck(y > 8);
        setProgress(max > 0 ? Math.min(100, (y / max) * 100) : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className="mn-header" data-stuck={stuck}>
      <div className="mn-shell mn-header-in">
        <a className="mn-wordmark" href="#top" aria-label={`${wordmarkLead} ${wordmarkAccent}`}>
          <MaisonWordmark
            lead={wordmarkLead}
            accent={wordmarkAccent}
            imageUrl={wordmarkImageUrl}
            ratio={wordmarkImageRatio}
          />
        </a>
        <nav className="mn-nav" aria-label="Secciones">
          {links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="mn-header-end">
          {localeSwitch ? <div className="mn-locale">{localeSwitch}</div> : null}
          {cta}
        </div>
      </div>
      <span className="mn-progress" style={{ width: `${progress}%` }} aria-hidden="true" />
    </header>
  );
}

export function MaisonMotion() {
  useEffect(() => {
    const root = document.querySelector(".mn-root");
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-mn-reveal]"));
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.classList.add("mn-armed");

    if (reduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.setAttribute("data-shown", "true"));
      return () => root.classList.remove("mn-armed");
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "true");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    targets.forEach((el) => io.observe(el));

    // Anything already on screen at mount (the hero) reveals on the next frame
    // so its transition still plays instead of snapping.
    const raf = window.requestAnimationFrame(() => {
      targets.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
          el.setAttribute("data-shown", "true");
          io.unobserve(el);
        }
      });
    });

    // Belt and braces: if an observer never fires for a target (a clipped or
    // zero-area box, a browser quirk), it must not stay invisible. Anything
    // still unrevealed after two seconds is shown outright.
    const failsafe = window.setTimeout(() => {
      targets.forEach((el) => {
        if (el.getAttribute("data-shown") !== "true") {
          el.setAttribute("data-shown", "true");
          io.unobserve(el);
        }
      });
    }, 2000);

    return () => {
      io.disconnect();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
      root.classList.remove("mn-armed");
    };
  }, []);

  return null;
}
