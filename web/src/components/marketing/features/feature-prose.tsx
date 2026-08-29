import {
  featurePathForLocale,
  getFeatureByKey,
  type Para,
} from "@/lib/marketing/features";
import { FeatureLink } from "./feature-link";

/**
 * Renders a paragraph from the catalogue.
 *
 * Paragraphs are typed segments rather than markup strings, so nothing here
 * parses anything: a string is text, an object is a cross-link. The path is
 * resolved on the server from the catalogue, which keeps the client component
 * underneath as small as an anchor and keeps every href built through
 * `withLocaleHref` where the marketing locale guard can see it.
 */
export function FeatureParagraph({ para, locale }: { para: Para; locale: string }) {
  return (
    <>
      {para.map((seg, i) => {
        if (typeof seg === "string") return <span key={i}>{seg}</span>;
        const target = getFeatureByKey(seg.f);
        // A dangling key is caught by the catalogue test, but never render a
        // broken link if one somehow reaches production.
        if (!target) return <span key={i}>{seg.label}</span>;
        return (
          <FeatureLink
            key={i}
            featureKey={seg.f}
            path={featurePathForLocale(target, locale)}
            locale={locale}
          >
            {seg.label}
          </FeatureLink>
        );
      })}
    </>
  );
}

export function FeatureProse({
  paras,
  locale,
  className,
  style,
}: {
  paras: Para[];
  locale: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      {paras.map((para, i) => (
        <p key={i}>
          <FeatureParagraph para={para} locale={locale} />
        </p>
      ))}
    </div>
  );
}
