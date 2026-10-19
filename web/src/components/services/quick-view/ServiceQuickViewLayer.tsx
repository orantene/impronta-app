/**
 * The quick views of one services list (TUL-1272 #3, #9). Server-safe (no hooks):
 * every fact sits in the page HTML inside a closed <dialog>, so crawlers read it
 * and a `#servicio-...` share link opens it. `ServiceQuickViewHost` (client) only
 * opens and closes the dialogs and routes "Reservar" into the booking sheet.
 */
import type { ServiceQuickView } from "@/lib/services/presentation/quick-view-model";
import { serviceQuickViewCopy } from "@/lib/services/presentation/quick-view-model";
import { serviceFaqCopy } from "@/lib/talent-site/service-page-faq";
import { serviceReviewsCopy } from "@/lib/talent-site/service-page-reviews";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";
import type { ServiceCardTarget } from "@/lib/services/presentation/card-target";

import { ServiceQuickViewHost } from "./ServiceQuickViewHost";
import { SERVICE_QUICK_VIEW_CSS } from "./quick-view-css";

function QuickViewDialog({ v }: { v: ServiceQuickView }) {
  const c = serviceQuickViewCopy(v.locale);
  const faqCopy = serviceFaqCopy(v.locale);
  const rc = serviceReviewsCopy(v.locale);
  const facts = [v.categoryLabel, v.priceText ?? v.priceNote, v.durationText].filter(Boolean).join(" · ");
  const titleId = `${v.id}-title`;
  return (
    <dialog id={v.id} className="sqv" aria-labelledby={titleId} data-service-quick-view={v.offeringId}>
      <div className="sqv-head">
        <h2 id={titleId} className="sqv-title">{v.title}</h2>
        <a href="#" className="sqv-close" aria-label={c.close} data-sqv-close="">
          <span aria-hidden>×</span>
        </a>
      </div>
      <div className="sqv-scroll">
        {facts ? <p className="sqv-facts">{facts}</p> : null}
        {v.photos.length > 0 ? (
          <div className="sqv-photos" role="group" aria-label={c.photos}>
            {v.photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt={i === 0 ? v.title : `${v.title} (${i + 1})`} loading="lazy" decoding="async" />
            ))}
          </div>
        ) : null}
        {v.description ? <p className="sqv-desc">{v.description}</p> : null}
        {v.policies.length > 0 ? (
          <section>
            <h3>{c.policies}</h3>
            <ul className="sqv-list">
              {v.policies.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {v.faq.length > 0 ? (
          <section>
            <h3>{faqCopy.heading}</h3>
            {v.faq.map((f) => (
              <details key={f.question}>
                <summary>{f.question}</summary>
                <p>{f.answer}</p>
              </details>
            ))}
          </section>
        ) : null}
        {v.reviews ? (
          <section>
            <h3>{rc.heading}</h3>
            {v.reviews.count > 0 ? (
              <p className="sqv-facts">{`★ ${new Intl.NumberFormat(v.locale, { maximumFractionDigits: 1 }).format(v.reviews.average)} · ${rc.count(v.reviews.count)}`}</p>
            ) : null}
            {v.reviews.reviews.map((r) => (
              <div key={r.id} className="sqv-review">
                <blockquote>{r.body}</blockquote>
                <p>{[r.clientName ?? rc.anonymous, r.demo ? rc.demo : null].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      {v.bookHref || v.pageHref ? (
        <div className="sqv-foot">
          <span className="sqv-price">{v.priceText ?? v.priceNote ?? ""}</span>
          <span className="sqv-actions">
            {v.pageHref ? (
              <a href={v.pageHref} className="sqv-page">{c.fullPage}</a>
            ) : null}
            {v.bookHref ? (
              <a href={v.bookHref} className="sqv-book" data-sqv-book={v.offeringId} rel="nofollow">
                {v.ctaLabel}
              </a>
            ) : null}
          </span>
        </div>
      ) : null}
    </dialog>
  );
}

export function ServiceQuickViewLayer({
  nodeId,
  views,
  targets,
  offerings,
  confirmsByHand = true,
  bookingPosture,
}: {
  /** The services widget node: the host only reacts to links inside it. */
  nodeId: string;
  views: readonly ServiceQuickView[];
  /** href -> what the card does; book cards need no dialog. */
  targets?: Record<string, ServiceCardTarget>;
  /** The offerings the host may hand to the booking sheet. */
  offerings?: readonly TalentOffering[];
  confirmsByHand?: boolean;
  bookingPosture?: TalentBookingPosture;
}) {
  const hasBook = targets ? Object.values(targets).some((t) => t.opens === "book") : false;
  if (views.length === 0 && !hasBook) return null;
  return (
    <>
      {views.length > 0 ? <style>{SERVICE_QUICK_VIEW_CSS}</style> : null}
      {views.map((v) => (
        <QuickViewDialog key={v.id} v={v} />
      ))}
      <ServiceQuickViewHost
        nodeId={nodeId}
        targets={targets ?? {}}
        offerings={offerings ?? []}
        confirmsByHand={confirmsByHand}
        bookingPosture={bookingPosture}
      />
    </>
  );
}
