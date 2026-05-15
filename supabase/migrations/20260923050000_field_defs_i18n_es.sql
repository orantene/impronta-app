-- C1/C2 — Spanish localization columns for the DB-driven field catalog.
-- The OLD field_definitions had label_en/label_es; the NEW
-- profile_field_definitions only carried English. Tulala has
-- Spanish-speaking talents/agencies, so the editor must be able to show
-- localized labels + helper text.
--
-- This migration adds the columns (nullable — English remains the
-- canonical fallback when a Spanish string is absent) and seeds Spanish
-- for the highest-traffic universal/global fields. Bulk translation of
-- all 241 type-specific fields is a separate data task (tracked
-- C1-followup) and intentionally NOT done here — a half-machine-
-- translated catalog is worse than a clean EN fallback.

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS label_es  text,
  ADD COLUMN IF NOT EXISTS helper_es text;

-- Seed Spanish for the universally-shown fields (the ones every talent
-- sees regardless of type — these are worth hand-translating now).
UPDATE public.profile_field_definitions SET label_es = CASE field_key
  WHEN 'creator.instagram_handle'            THEN 'Usuario de Instagram'
  WHEN 'creator.tiktok_handle'               THEN 'Usuario de TikTok'
  WHEN 'creator.youtube_channel'             THEN 'Canal de YouTube'
  WHEN 'media.website_url'                    THEN 'Sitio web personal'
  WHEN 'media.moodboard'                      THEN 'Mood / tablero de estilo'
  WHEN 'experience.years_total'              THEN 'Años de experiencia'
  WHEN 'experience.level'                    THEN 'Nivel de experiencia'
  WHEN 'experience.notable_work'             THEN 'Trabajo destacado'
  WHEN 'experience.professional_highlights'  THEN 'Puntos fuertes profesionales'
  WHEN 'availability.status'                 THEN 'Disponibilidad para reservas'
  WHEN 'availability.available_for'          THEN 'Disponible para'
  WHEN 'travel.willing'                      THEN 'Dispuesto/a a viajar'
  WHEN 'travel.scope'                        THEN 'Alcance de viaje'
  WHEN 'physical.height_cm'                  THEN 'Altura (cm)'
  WHEN 'physical.eye_color'                  THEN 'Color de ojos'
  WHEN 'physical.hair_color'                 THEN 'Color de cabello'
  WHEN 'physical.hair_length'                THEN 'Largo de cabello'
  WHEN 'physical.body_type'                  THEN 'Tipo de cuerpo'
  WHEN 'physical.dress_size'                 THEN 'Talla de ropa'
  WHEN 'physical.shoe_size_eu'               THEN 'Talla de calzado (EU)'
  WHEN 'physical.allergies'                  THEN 'Alergias / dieta'
  ELSE label_es
END
WHERE field_key IN (
  'creator.instagram_handle','creator.tiktok_handle','creator.youtube_channel',
  'media.website_url','media.moodboard','experience.years_total',
  'experience.level','experience.notable_work','experience.professional_highlights',
  'availability.status','availability.available_for','travel.willing','travel.scope',
  'physical.height_cm','physical.eye_color','physical.hair_color','physical.hair_length',
  'physical.body_type','physical.dress_size','physical.shoe_size_eu','physical.allergies'
);
