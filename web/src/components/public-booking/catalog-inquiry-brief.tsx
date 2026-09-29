import { formatOfferingWhereLabel, type OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";

/** Choose-step inquiry brief: existing description + attributes.where only. */
export function CatalogInquiryBrief({
  description,
  where,
  inclusion,
  locale,
}: {
  description?: string | null;
  where?: OfferingDeliveryWhere[];
  inclusion?: string | null;
  locale: string;
}) {
  const es = locale.toLowerCase().startsWith("es");
  const brief = description?.trim() ?? "";
  const delivery = formatOfferingWhereLabel(where ?? [], locale);
  if (!brief && !delivery && !inclusion) return null;
  return (
    <>
      {brief ? (
        <p className="jb-brief" data-inquiry-brief="description">
          {brief}
        </p>
      ) : null}
      {delivery ? (
        <p className="jb-delivery" data-inquiry-brief="delivery">
          {es ? "Lugar" : "Location"} · {delivery}
        </p>
      ) : null}
      {inclusion ? <p className="jb-incl">✓ {inclusion}</p> : null}
    </>
  );
}
