-- REPLACEMENT for 20260906030257_product_features_localized_labels.sql.
--
-- WHY THE ORIGINAL CANNOT APPLY FROM SCRATCH
--   The migration builds label_i18n / value_text_i18n from two hard-coded
--   English→Spanish maps and then refuses a half-filled backfill:
--       ERROR:  localisation incomplete: 2 comparison row(s) have a value with
--               no Spanish.
--   Its value map covers 'Basic', 'Full', 'Full + white-label', 'Unlimited',
--   'Up to 15', 'Up to 3', 'Up to 5' and '2'. The pricing catalog this repo
--   builds from its own seeds carries more tiers than that — measured on a
--   from-scratch replay: 'Up to 10' and 'Up to 50' from
--   20260528002518_product_features_compare_table.sql line 53, then 'Up to 8'
--   and '1' once the later catalog migrations have run. Production's pricing
--   rows had been edited by hand by the time this was pushed, which is why the
--   assertion passed there. The assertion is inside the migration's own
--   transaction, so no pre- or post-shim can satisfy it.
--
-- WHAT THIS FILE CHANGES — ONE STATEMENT, AND NOTHING ELSE
--   Byte-for-byte the original, plus one UPDATE after its value map that
--   applies the two transformations the map itself already encodes, to any
--   value tier the map does not name:
--       'Up to <n>'  ->  'Hasta <n>'   (the map's own ('Up to 15','Hasta 15'))
--       '<n>'        ->  '<n>'         (the map's own ('2','2'))
--   It touches only rows the map left without Spanish, so every pair the
--   migration's author wrote still wins. Nothing is renamed, no row is edited
--   to fit, and the assertion runs unchanged — it now passes because every
--   comparison row really does have a Spanish value.
--
--   A rule rather than two more literal pairs, deliberately: the catalog's
--   value tiers change with the pricing migrations, and a literal list would
--   have to be chased every time one of them moves. A value tier that is
--   NEITHER 'Up to <n>' NOR a bare number still fails the assertion, which is
--   the migration working as designed — a new kind of value needs a real
--   translation, not a pattern.
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

-- CI completion rule for value tiers the map above does not name.
-- See this file's header: same two transformations, applied only to rows
-- the map left without a Spanish value.
update public.product_features f
set value_text_i18n = coalesce(f.value_text_i18n, '{}'::jsonb)
  || jsonb_build_object('es',
       case when f.value_text ~ '^Up to [0-9]+$'
            then regexp_replace(f.value_text, '^Up to ', 'Hasta ')
            else f.value_text
       end)
where f.value_text is not null
  and (f.value_text ~ '^Up to [0-9]+$' or f.value_text ~ '^[0-9]+$')
  and (f.value_text_i18n is null or f.value_text_i18n->>'es' is null);

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
