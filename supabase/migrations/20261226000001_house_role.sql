-- Menu Phase 1: add 'house' to inquiry_participant_role.
-- THIS FILE MUST DO NOTHING ELSE. Postgres forbids using a newly-added enum
-- value in the same transaction that adds it ("unsafe use of new value of
-- enum type"). Shape CHECKs live in 20261226000002.

ALTER TYPE public.inquiry_participant_role ADD VALUE IF NOT EXISTS 'house';
