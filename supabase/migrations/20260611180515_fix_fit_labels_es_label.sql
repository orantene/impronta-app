-- Fix the Spanglish placeholder label_es for fit_labels in System B.
-- The May-27 visibility-scaffolding migration set label_es = 'Etiquetas de fit'
-- (Spanglish). The correct Spanish equivalent of "Fit Labels" used by System A
-- is "Etiquetas de ajuste". This UPDATE corrects it idempotently.
UPDATE public.profile_field_definitions
SET label_es = 'Etiquetas de ajuste'
WHERE field_key = 'fit_labels'
  AND label_es  = 'Etiquetas de fit';
