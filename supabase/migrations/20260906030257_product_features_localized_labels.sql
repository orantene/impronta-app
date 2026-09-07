-- The Spanish pricing page has always rendered English.
--
-- `product_features` carried ONE `label` column, and the compare table rendered
-- it raw, so every row of /es/pricing was English. Same for `value_text`
-- ("Unlimited", "Up to 15"). This adds the locale maps and fills them in.
--
-- ADDITIVE ONLY, AND THE ENGLISH COLUMNS STAY
-- ===========================================
-- `label` and `value_text` remain the source of truth for English and the
-- fallback for any locale with no translation. Nothing that reads them today
-- breaks, which is what makes applying this before the code merges safe.
--
-- Shape follows the house pattern: a jsonb {en, es} map, the same fold
-- catalog-map-data.ts describes for label/label_es.

begin;

alter table public.product_features
  add column if not exists label_i18n jsonb,
  add column if not exists value_text_i18n jsonb;

comment on column public.product_features.label_i18n is
  'Locale map {en, es} for `label`. `label` stays the English source and the fallback for any missing locale.';
comment on column public.product_features.value_text_i18n is
  'Locale map {en, es} for `value_text`. Null when the row has no value tier.';

-- English first, from the column that already holds it.
update public.product_features
set label_i18n = jsonb_build_object('en', label)
where label is not null;

update public.product_features
set value_text_i18n = jsonb_build_object('en', value_text)
where value_text is not null;

-- Spanish, by label. Rows not listed keep {en} only and fall back to English.
update public.product_features f
set label_i18n = f.label_i18n || jsonb_build_object('es', v.es)
from (values
  ('Analytics & funnels', 'Analíticas y embudos'),
  ('Audit log', 'Registro de auditoría'),
  ('Baked watermark exports (PDF / lookbook)', 'Exportaciones con marca de agua incrustada (PDF / lookbook)'),
  ('Booking conversion + calendar data', 'Conversión de reservas y datos de calendario'),
  ('Branded identity & design system', 'Identidad de marca y sistema de diseño'),
  ('Bulk watermark apply', 'Aplicación masiva de marca de agua'),
  ('CMS pages / posts / nav', 'Páginas, entradas y navegación del CMS'),
  ('Custom domain', 'Dominio propio'),
  ('Data export', 'Exportación de datos'),
  ('Email notifications', 'Notificaciones por correo'),
  ('Free subdomain', 'Subdominio gratuito'),
  ('In-app notifications', 'Notificaciones en la aplicación'),
  ('Inquiry message threads', 'Hilos de mensajes de consultas'),
  ('Logo watermark on photos', 'Marca de agua con logo en las fotos'),
  ('Multi-locale', 'Varios idiomas'),
  ('Multi-party approvals', 'Aprobaciones de varias partes'),
  ('People profiles', 'Perfiles de personas'),
  ('Per-photo watermark override', 'Marca de agua personalizada por foto'),
  ('Photo usage tracking', 'Seguimiento de uso de fotos'),
  ('Priority email routing', 'Enrutamiento prioritario de correo'),
  ('Priority onboarding', 'Incorporación prioritaria'),
  ('Roles & permissions', 'Roles y permisos'),
  ('Seats', 'Puestos'),
  ('Shared hub discovery (opt-in)', 'Descubrimiento compartido en el hub (opcional)'),
  ('Structured inquiry inbox', 'Bandeja de consultas estructurada'),
  ('Versioned offers', 'Ofertas con versiones'),
  ('Watermark position, opacity & size', 'Posición, opacidad y tamaño de la marca de agua'),
  ('WhatsApp inquiry notifications', 'Notificaciones de consultas por WhatsApp'),
  ('Workspace media gallery', 'Galería de medios del espacio de trabajo')
) as v(en, es)
where f.label = v.en;

update public.product_features f
set value_text_i18n = f.value_text_i18n || jsonb_build_object('es', v.es)
from (values
  ('Basic', 'Básico'),
  ('Full', 'Completo'),
  ('Full + white-label', 'Completo y marca blanca'),
  ('Unlimited', 'Ilimitado'),
  ('Up to 15', 'Hasta 15'),
  ('Up to 3', 'Hasta 3'),
  ('Up to 5', 'Hasta 5'),
  ('2', '2')
) as v(en, es)
where f.value_text = v.en;

-- Refuse a half-filled backfill.
-- These are label-matched updates: a renamed label makes the whole thing a
-- no-op that still reports success, which is the failure this project keeps
-- meeting. Only the comparison rows are required to be complete; `core` rows
-- belong to the plan cards and are not rendered by this table.
do $$
declare
  missing_es int;
  missing_value_es int;
begin
  select count(*) into missing_es
  from public.product_features f
  join public.product_tiers t on t.id = f.tier_id
  where t.is_active and f.category is not null and f.category <> 'core'
    and (f.label_i18n is null or f.label_i18n->>'es' is null);

  select count(*) into missing_value_es
  from public.product_features f
  join public.product_tiers t on t.id = f.tier_id
  where t.is_active and f.category is not null and f.category <> 'core'
    and f.value_text is not null
    and (f.value_text_i18n is null or f.value_text_i18n->>'es' is null);

  if missing_es > 0 then
    raise exception
      'localisation incomplete: % comparison row(s) have no Spanish label. A label was renamed or a new one was added without a translation.',
      missing_es;
  end if;

  if missing_value_es > 0 then
    raise exception
      'localisation incomplete: % comparison row(s) have a value with no Spanish.',
      missing_value_es;
  end if;
end $$;

commit;
