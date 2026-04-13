-- Taxonomy kinds expansion + seeded data for Impronta Models & Talent
-- Locks kinds via enum, seeds requested lists, and adds location taxonomy terms.

BEGIN;
-- ---------------------------------------------------------------------------
-- Expand taxonomy_kind enum (locked kinds; no arbitrary strings)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TYPE public.taxonomy_kind ADD VALUE IF NOT EXISTS 'location_city';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  ALTER TYPE public.taxonomy_kind ADD VALUE IF NOT EXISTS 'location_country';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
-- ---------------------------------------------------------------------------
-- Seed: Talent Types
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('talent_type', 'model', 'Model', 'Modelo', 10),
  ('talent_type', 'fashion-model', 'Fashion Model', 'Modelo de moda', 20),
  ('talent_type', 'editorial-model', 'Editorial Model', 'Modelo editorial', 30),
  ('talent_type', 'commercial-model', 'Commercial Model', 'Modelo comercial', 40),
  ('talent_type', 'promotional-model', 'Promotional Model', 'Modelo promocional', 50),
  ('talent_type', 'hostess', 'Hostess', 'Anfitriona', 60),
  ('talent_type', 'brand-ambassador', 'Brand Ambassador', 'Embajador(a) de marca', 70),
  ('talent_type', 'influencer', 'Influencer', 'Influencer', 80),
  ('talent_type', 'actor', 'Actor', 'Actor/Actriz', 90),
  ('talent_type', 'performer', 'Performer', 'Artista', 100),
  ('talent_type', 'dancer', 'Dancer', 'Bailarín(a)', 110),
  ('talent_type', 'dj', 'DJ', 'DJ', 120),
  ('talent_type', 'entertainer', 'Entertainer', 'Animador(a)', 130),
  ('talent_type', 'fitness-model', 'Fitness Model', 'Modelo fitness', 140),
  ('talent_type', 'runway-model', 'Runway Model', 'Modelo de pasarela', 150),
  ('talent_type', 'trade-show-model', 'Trade Show Model', 'Modelo para expo', 160)
ON CONFLICT (kind, slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed: Tags
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('tag', 'luxury', 'Luxury', 'Lujo', 10),
  ('tag', 'bilingual', 'Bilingual', 'Bilingüe', 20),
  ('tag', 'premium', 'Premium', 'Premium', 30),
  ('tag', 'vip', 'VIP', 'VIP', 40),
  ('tag', 'featured', 'Featured', 'Destacado(a)', 50),
  ('tag', 'international', 'International', 'Internacional', 60),
  ('tag', 'local-talent', 'Local Talent', 'Talento local', 70),
  ('tag', 'experienced', 'Experienced', 'Con experiencia', 80),
  ('tag', 'new-face', 'New Face', 'Nuevo(a)', 90),
  ('tag', 'high-energy', 'High Energy', 'Alta energía', 100),
  ('tag', 'professional', 'Professional', 'Profesional', 110),
  ('tag', 'camera-ready', 'Camera Ready', 'Listo(a) para cámara', 120),
  ('tag', 'event-specialist', 'Event Specialist', 'Especialista en eventos', 130),
  ('tag', 'travel-ready', 'Travel Ready', 'Disponible para viajar', 140),
  ('tag', 'corporate-friendly', 'Corporate Friendly', 'Ideal corporativo', 150)
ON CONFLICT (kind, slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed: Skills
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('skill', 'runway', 'Runway', 'Pasarela', 10),
  ('skill', 'hosting', 'Hosting', 'Presentación', 20),
  ('skill', 'dancing', 'Dancing', 'Baile', 30),
  ('skill', 'public-speaking', 'Public Speaking', 'Oratoria', 40),
  ('skill', 'acting', 'Acting', 'Actuación', 50),
  ('skill', 'product-demo', 'Product Demo', 'Demostración de producto', 60),
  ('skill', 'sales', 'Sales', 'Ventas', 70),
  ('skill', 'brand-activation', 'Brand Activation', 'Activación de marca', 80),
  ('skill', 'crowd-engagement', 'Crowd Engagement', 'Interacción con público', 90),
  ('skill', 'modeling', 'Modeling', 'Modelaje', 100),
  ('skill', 'fitness', 'Fitness', 'Fitness', 110),
  ('skill', 'social-media', 'Social Media', 'Redes sociales', 120),
  ('skill', 'influencer-marketing', 'Influencer Marketing', 'Marketing de influencers', 130),
  ('skill', 'promotions', 'Promotions', 'Promociones', 140),
  ('skill', 'stage-performance', 'Stage Performance', 'Performance en escenario', 150),
  ('skill', 'event-support', 'Event Support', 'Apoyo en eventos', 160)
ON CONFLICT (kind, slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed: Industries
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('industry', 'fashion', 'Fashion', 'Moda', 10),
  ('industry', 'hospitality', 'Hospitality', 'Hospitalidad', 20),
  ('industry', 'nightlife', 'Nightlife', 'Vida nocturna', 30),
  ('industry', 'corporate', 'Corporate', 'Corporativo', 40),
  ('industry', 'luxury-events', 'Luxury Events', 'Eventos de lujo', 50),
  ('industry', 'trade-shows', 'Trade Shows', 'Expos', 60),
  ('industry', 'automotive', 'Automotive', 'Automotriz', 70),
  ('industry', 'technology', 'Technology', 'Tecnología', 80),
  ('industry', 'real-estate', 'Real Estate', 'Bienes raíces', 90),
  ('industry', 'tourism', 'Tourism', 'Turismo', 100),
  ('industry', 'food-beverage', 'Food & Beverage', 'Alimentos y bebidas', 110),
  ('industry', 'beauty', 'Beauty', 'Belleza', 120),
  ('industry', 'fitness', 'Fitness', 'Fitness', 130),
  ('industry', 'music', 'Music', 'Música', 140),
  ('industry', 'entertainment', 'Entertainment', 'Entretenimiento', 150)
ON CONFLICT (kind, slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed: Event Types
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('event_type', 'trade-show', 'Trade Show', 'Expo', 10),
  ('event_type', 'corporate-event', 'Corporate Event', 'Evento corporativo', 20),
  ('event_type', 'brand-activation', 'Brand Activation', 'Activación de marca', 30),
  ('event_type', 'nightclub-event', 'Nightclub Event', 'Evento en nightclub', 40),
  ('event_type', 'private-party', 'Private Party', 'Fiesta privada', 50),
  ('event_type', 'luxury-event', 'Luxury Event', 'Evento de lujo', 60),
  ('event_type', 'product-launch', 'Product Launch', 'Lanzamiento de producto', 70),
  ('event_type', 'conference', 'Conference', 'Conferencia', 80),
  ('event_type', 'expo', 'Expo', 'Expo', 90),
  ('event_type', 'festival', 'Festival', 'Festival', 100),
  ('event_type', 'wedding', 'Wedding', 'Boda', 110),
  ('event_type', 'vip-event', 'VIP Event', 'Evento VIP', 120),
  ('event_type', 'photoshoot', 'Photoshoot', 'Sesión de fotos', 130),
  ('event_type', 'commercial-shoot', 'Commercial Shoot', 'Grabación comercial', 140),
  ('event_type', 'promotional-campaign', 'Promotional Campaign', 'Campaña promocional', 150)
ON CONFLICT (kind, slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed: Fit Labels
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('fit_label', 'best-for-nightlife', 'Best for Nightlife', 'Ideal para nightlife', 10),
  ('fit_label', 'best-for-corporate', 'Best for Corporate', 'Ideal corporativo', 20),
  ('fit_label', 'best-for-luxury', 'Best for Luxury', 'Ideal para lujo', 30),
  ('fit_label', 'best-for-promotions', 'Best for Promotions', 'Ideal para promociones', 40),
  ('fit_label', 'best-for-trade-shows', 'Best for Trade Shows', 'Ideal para expos', 50),
  ('fit_label', 'best-for-hosting', 'Best for Hosting', 'Ideal para presentación', 60),
  ('fit_label', 'best-for-acting', 'Best for Acting', 'Ideal para actuación', 70),
  ('fit_label', 'best-for-dancing', 'Best for Dancing', 'Ideal para baile', 80),
  ('fit_label', 'best-for-fashion', 'Best for Fashion', 'Ideal para moda', 90),
  ('fit_label', 'best-for-events', 'Best for Events', 'Ideal para eventos', 100)
ON CONFLICT (kind, slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed: Languages
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('language', 'en', 'English', 'Inglés', 10),
  ('language', 'es', 'Spanish', 'Español', 20),
  ('language', 'pt', 'Portuguese', 'Portugués', 30),
  ('language', 'fr', 'French', 'Francés', 40),
  ('language', 'it', 'Italian', 'Italiano', 50),
  ('language', 'de', 'German', 'Alemán', 60),
  ('language', 'he', 'Hebrew', 'Hebreo', 70),
  ('language', 'ru', 'Russian', 'Ruso', 80)
ON CONFLICT (kind, slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed: Locations (taxonomy)
-- Country slugs use ISO-ish lowercase (mx, es). City slugs match locations.city_slug.
-- ---------------------------------------------------------------------------
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('location_country', 'mx', 'Mexico', 'México', 10),
  ('location_country', 'es', 'Spain', 'España', 20)
ON CONFLICT (kind, slug) DO NOTHING;
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order) VALUES
  ('location_city', 'cancun', 'Cancún', 'Cancún', 10),
  ('location_city', 'playa-del-carmen', 'Playa del Carmen', 'Playa del Carmen', 20),
  ('location_city', 'ibiza', 'Ibiza', 'Ibiza', 30)
ON CONFLICT (kind, slug) DO NOTHING;
COMMIT;
