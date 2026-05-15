-- B5 — `unit` column on the field catalog so numeric inputs can show a
-- unit suffix ("9 years", "200 guests", "45 min") instead of a bare
-- number. Nullable — most fields have no unit and render as today.

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS unit text;

UPDATE public.profile_field_definitions SET unit = CASE field_key
  WHEN 'experience.years_total'           THEN 'years'
  WHEN 'model.runway_experience_years'    THEN 'years'
  WHEN 'chef.event_capacity_min'          THEN 'guests'
  WHEN 'chef.event_capacity_max'          THEN 'guests'
  WHEN 'chef.min_guests'                  THEN 'guests'
  WHEN 'chef.max_guests'                  THEN 'guests'
  WHEN 'performer.group_size'             THEN 'people'
  WHEN 'singer.set_duration_min'          THEN 'min'
  WHEN 'singer.set_duration_max'          THEN 'min'
  WHEN 'transport.max_run_hours'          THEN 'hrs'
  WHEN 'event.max_shift_hours'            THEN 'hrs'
  WHEN 'availability.advance_notice_hours' THEN 'hrs'
  WHEN 'transport.child_seat_count'       THEN 'seats'
  ELSE unit
END
WHERE field_key IN (
  'experience.years_total','model.runway_experience_years',
  'chef.event_capacity_min','chef.event_capacity_max','chef.min_guests',
  'chef.max_guests','performer.group_size','singer.set_duration_min',
  'singer.set_duration_max','transport.max_run_hours','event.max_shift_hours',
  'availability.advance_notice_hours','transport.child_seat_count'
);
