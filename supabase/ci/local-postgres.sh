#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CI-only: a throwaway PostgreSQL cluster that stands in for `supabase start`.
#
# WHY THIS EXISTS
#   `supabase start` needs Docker image pulls. Those are blocked by egress
#   policy in the agent containers where this history is triaged, and a Docker
#   boot costs minutes per attempt in CI too. Replaying 859 migrations is an
#   iterative job: you need a fresh database in seconds, not minutes.
#   This script builds one from the plain postgresql-16 binaries that are
#   already on the box, then creates BY HAND the Supabase-managed pieces that
#   `supabase/migrations/` reference but never create themselves — the ones a
#   real Supabase project gets from the auth / storage / realtime services.
#
# WHAT IS A FAITHFUL COPY AND WHAT IS A STAND-IN
#   Everything under `public` comes from the real migrations: this script never
#   creates an application object. The Supabase-managed schemas below are
#   RECONSTRUCTED from what the migrations actually reference (see the per-
#   object headers). They are shaped to satisfy those references — foreign
#   keys, triggers, RLS predicates, the columns the migrations read and write.
#   They are NOT the auth/storage services' own schemas and must never be
#   treated as a source of truth for them.
#
# KNOWN DIVERGENCES FROM PRODUCTION (stated, not hidden)
#   - PostgreSQL 16 here vs `major_version = 17` in supabase/config.toml.
#     Nothing in the history is 17-only so far; if a migration ever needs a 17
#     feature this script must move to a 17 cluster.
#   - `auth.uid()` / `auth.role()` / `auth.jwt()` read the same GUCs the real
#     Supabase helpers read (`request.jwt.claim.sub`, `request.jwt.claims`),
#     so migration-time proofs that `set_config(...)` + `SET LOCAL ROLE` work
#     unchanged. No JWT is verified: there is no auth service here.
#   - `storage.objects` / `storage.buckets` hold the columns the migrations'
#     policies and helpers touch. The storage service's own extra columns are
#     absent because nothing in the history references them.
#   - `realtime.messages` / `realtime.topic()` exist so
#     20261213000008_support_realtime_private.sql takes its real branch instead
#     of the `to_regclass IS NULL` skip branch. No realtime server runs.
#
# PREREQUISITES
#   The postgresql-16 server binaries, and pgvector: talent_embeddings.embedding
#   is a `vector` column, and pgvector is the one extension the history needs
#   that a stock PostgreSQL does not ship.
#     apt-get install -y postgresql-16 postgresql-16-pgvector
#   A real Supabase project ships pgvector, so CI against `supabase start`
#   needs nothing extra. The bootstrap below says so by name if it is missing.
#
# USAGE
#   source supabase/ci/local-postgres.sh          # exports PG* into the shell
#   bash   supabase/ci/local-postgres.sh up       # create + start + bootstrap
#   bash   supabase/ci/local-postgres.sh reset    # drop + recreate the database
#   bash   supabase/ci/local-postgres.sh down     # stop and delete the cluster
#   bash   supabase/ci/local-postgres.sh env      # print the PG* exports
#
# Environment knobs:
#   PGDATA_DIR   cluster directory      (default /tmp/impronta-ci-pg)
#   PGPORT       port                   (default: first free from 55432)
#   PGDATABASE   database name          (default postgres)
#   PGBIN        postgres bin directory (default: autodetected 16/17/15)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

PGDATA_DIR="${PGDATA_DIR:-/tmp/impronta-ci-pg}"
PGDATABASE="${PGDATABASE:-postgres}"
PGUSER="${PGUSER:-postgres}"
PGHOST="${PGHOST:-127.0.0.1}"

find_bin() {
  if [ -n "${PGBIN:-}" ]; then echo "$PGBIN"; return; fi
  local v
  for v in 17 16 15; do
    [ -x "/usr/lib/postgresql/$v/bin/initdb" ] && { echo "/usr/lib/postgresql/$v/bin"; return; }
  done
  command -v initdb >/dev/null && { dirname "$(command -v initdb)"; return; }
  echo "no postgres binaries found (looked in /usr/lib/postgresql/{17,16,15}/bin)" >&2
  exit 1
}
PGBIN="$(find_bin)"

free_port() {
  local p="${1:-55432}"
  while "$PGBIN/pg_isready" -q -h 127.0.0.1 -p "$p" 2>/dev/null || \
        (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; do p=$((p + 1)); done
  echo "$p"
}

# A running cluster keeps its port in postmaster.opts; reuse it.
if [ -f "$PGDATA_DIR/postmaster.pid" ]; then
  PGPORT="${PGPORT:-$(sed -n '4p' "$PGDATA_DIR/postmaster.pid" 2>/dev/null)}"
fi
PGPORT="${PGPORT:-$(free_port)}"
export PGDATA_DIR PGPORT PGUSER PGHOST PGDATABASE PGBIN
export PGPASSWORD="${PGPASSWORD:-postgres}"

log() { printf '[local-postgres] %s\n' "$*" >&2; }

# initdb / postgres refuse to run as root. In containers that run as root
# (every agent sandbox here, and `runs-on: ubuntu-latest` when a step is run in
# a root container) drop to the packaged `postgres` OS account for the two
# commands that touch the data directory. psql keeps running as whoever
# invoked the script: it only speaks TCP.
PG_OSUSER=""
if [ "$(id -u)" = "0" ] && id -u postgres >/dev/null 2>&1; then PG_OSUSER="postgres"; fi
as_pg() { # run "$@" as the cluster owner
  if [ -n "$PG_OSUSER" ]; then
    su "$PG_OSUSER" -s /bin/bash -c "$(printf '%q ' "$@")"
  else
    "$@"
  fi
}

pg_running() { "$PGBIN/pg_isready" -q -h "$PGHOST" -p "$PGPORT" 2>/dev/null; }

cmd_up() {
  if pg_running; then log "already running on port $PGPORT"; else
    if [ ! -f "$PGDATA_DIR/PG_VERSION" ]; then
      log "initdb -> $PGDATA_DIR ($("$PGBIN/initdb" --version))"
      rm -rf "$PGDATA_DIR"; mkdir -p "$PGDATA_DIR"
      [ -n "$PG_OSUSER" ] && chown -R "$PG_OSUSER" "$PGDATA_DIR"
      # trust auth: this cluster listens on loopback only and is thrown away.
      as_pg "$PGBIN/initdb" -D "$PGDATA_DIR" -U "$PGUSER" -A trust \
        --encoding=UTF8 --locale=C >/dev/null || exit 1
    fi
    log "starting on 127.0.0.1:$PGPORT"
    as_pg "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -l "$PGDATA_DIR/server.log" -w -o \
      "-p $PGPORT -k $PGDATA_DIR -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_locks_per_transaction=256" \
      start >/dev/null || { tail -30 "$PGDATA_DIR/server.log" >&2; exit 1; }
  fi
  bootstrap
}

cmd_down() {
  pg_running && as_pg "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -m immediate -w stop >/dev/null 2>&1
  rm -rf "$PGDATA_DIR"
  log "cluster removed"
}

cmd_reset() {
  pg_running || cmd_up
  log "dropping and recreating database $PGDATABASE"
  psql -X -q -d postgres -p "$PGPORT" -h "$PGHOST" -U "$PGUSER" \
    -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$PGDATABASE' and pid <> pg_backend_pid();" >/dev/null 2>&1
  # `postgres` is the maintenance database; rebuild it by name via template1.
  if [ "$PGDATABASE" = "postgres" ]; then
    psql -X -q -d template1 -p "$PGPORT" -h "$PGHOST" -U "$PGUSER" \
      -c "drop database if exists postgres;" -c "create database postgres;" >/dev/null || exit 1
  else
    psql -X -q -d postgres -p "$PGPORT" -h "$PGHOST" -U "$PGUSER" \
      -c "drop database if exists \"$PGDATABASE\";" -c "create database \"$PGDATABASE\";" >/dev/null || exit 1
  fi
  bootstrap
}

cmd_env() {
  cat <<EOF
export PGHOST=$PGHOST
export PGPORT=$PGPORT
export PGUSER=$PGUSER
export PGPASSWORD=$PGPASSWORD
export PGDATABASE=$PGDATABASE
EOF
}

bootstrap() {
  log "bootstrapping Supabase scaffolding into $PGDATABASE"
  PGOPTIONS='-c client_min_messages=warning' \
  psql -X -q -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL' || exit 1
-- ── roles ──────────────────────────────────────────────────────────────────
-- Migrations GRANT to these and several `SET LOCAL ROLE authenticated` inside
-- DO-block proofs. NOLOGIN: nothing connects as them, they only carry grants.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','supabase_admin',
                           'authenticator','supabase_auth_admin','supabase_storage_admin',
                           'supabase_realtime_admin','dashboard_user','postgres'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT', r);
    END IF;
  END LOOP;
END $$;
-- The proofs switch to `authenticated` and back; `authenticator` is the role
-- PostgREST connects as and inherits the other three.
GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role, supabase_auth_admin, supabase_storage_admin TO postgres;
ALTER ROLE supabase_admin  WITH SUPERUSER;
ALTER ROLE supabase_auth_admin    WITH CREATEROLE;
ALTER ROLE supabase_storage_admin WITH CREATEROLE;

-- ── schemas ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth           AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage        AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
GRANT USAGE ON SCHEMA auth, storage, realtime, extensions, graphql_public
  TO anon, authenticated, service_role, postgres;

-- ── extensions ─────────────────────────────────────────────────────────────
-- `pgcrypto` lives in `extensions` because three migrations call
-- extensions.crypt()/extensions.gen_salt() by that exact name. The rest are
-- created in `public` because that is what the migrations that need them ask
-- for (`CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public`, etc.);
-- pre-creating them here only makes those statements no-ops.
CREATE EXTENSION IF NOT EXISTS pgcrypto  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext    WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm   WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
-- pgvector is the one extension a stock PostgreSQL install does NOT ship, and
-- talent_embeddings.embedding is a `vector` column, so the replay cannot build
-- production's schema without it. Say which package is missing instead of
-- failing with a bare "extension is not available".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    RAISE EXCEPTION
      'pgvector is not installed. This cluster cannot reproduce '
      'public.talent_embeddings.embedding (type `vector`). Install it: '
      'apt-get install -y postgresql-%-pgvector  (a real Supabase project '
      'ships it, so CI against `supabase start` needs nothing.)',
      current_setting('server_version_num')::int / 10000;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS vector    WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
-- Unqualified crypt()/gen_salt()/digest() appear too, so `extensions` has to
-- be on the search path for the database and for every role.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO public, extensions',
                 current_database());
END $$;

-- ── auth ───────────────────────────────────────────────────────────────────
-- Reconstructed from the references in supabase/migrations/:
--   * 77 `REFERENCES auth.users(id)` foreign keys  -> id uuid PRIMARY KEY
--   * `FROM auth.users` / `JOIN auth.users` reading u.email
--   * handle_new_user() triggers on AFTER INSERT reading
--     NEW.raw_user_meta_data ->> 'full_name' / 'name' / 'signup_intent'
--   * 20260911022138 inserts (id, instance_id, aud, role, email,
--     encrypted_password, email_confirmed_at, raw_app_meta_data,
--     raw_user_meta_data, created_at, updated_at) directly
--   * 20261017091500 reads email_confirmed_at
-- Column types match the real auth service (uuid / text / jsonb / timestamptz)
-- so nothing in the history sees a different type than production does.
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id            uuid,
  id                     uuid PRIMARY KEY,
  aud                    varchar(255),
  role                   varchar(255),
  email                  varchar(255),
  encrypted_password     varchar(255),
  email_confirmed_at     timestamptz,
  invited_at             timestamptz,
  confirmation_token     varchar(255),
  confirmation_sent_at   timestamptz,
  recovery_token         varchar(255),
  recovery_sent_at       timestamptz,
  email_change_token_new varchar(255),
  email_change           varchar(255),
  email_change_sent_at   timestamptz,
  last_sign_in_at        timestamptz,
  raw_app_meta_data      jsonb,
  raw_user_meta_data     jsonb,
  is_super_admin         boolean,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  phone                  text DEFAULT NULL::character varying UNIQUE,
  phone_confirmed_at     timestamptz,
  confirmed_at           timestamptz GENERATED ALWAYS AS
                           (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  banned_until           timestamptz,
  deleted_at             timestamptz,
  is_anonymous           boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key
  ON auth.users (email) WHERE is_anonymous = false;

CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id     text NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  identity_data   jsonb NOT NULL,
  provider        text NOT NULL,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  email           text GENERATED ALWAYS AS (lower(identity_data ->> 'email')) STORED,
  id              uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  PRIMARY KEY (provider_id, provider)
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz,
  updated_at timestamptz,
  not_after  timestamptz
);

-- The three helpers every RLS policy in the history calls. Same GUC names and
-- same fallbacks as Supabase's own, so `set_config('request.jwt.claim.sub',…)`
-- in the migrations' proof blocks behaves identically.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO postgres, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role, postgres;

-- ── storage ────────────────────────────────────────────────────────────────
-- 60 policy/helper references to storage.objects (bucket_id, name, owner,
-- owner_id, metadata), 6 to storage.buckets, 16 to storage.foldername(name).
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  owner              uuid,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  public             boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id               uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  bucket_id        text REFERENCES storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata         jsonb,
  path_tokens      text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version          text,
  owner_id         text,
  user_metadata    jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS bucketid_objname ON storage.objects (bucket_id, name);
ALTER TABLE storage.objects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1 : array_length(_parts, 1) - 1];
END $$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[array_length(_parts, 1)];
END $$;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; _filename text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _filename;
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres, service_role;
GRANT SELECT ON storage.buckets, storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role, postgres;

-- ── realtime ───────────────────────────────────────────────────────────────
-- 20261213000008_support_realtime_private.sql only creates its private-channel
-- policies when to_regclass('realtime.messages') is not null; without this it
-- silently takes the skip branch and CI would not exercise the policies at all.
CREATE TABLE IF NOT EXISTS realtime.messages (
  topic      text NOT NULL,
  extension  text NOT NULL,
  payload    jsonb,
  event      text,
  private    boolean DEFAULT false,
  updated_at timestamp NOT NULL DEFAULT now(),
  inserted_at timestamp NOT NULL DEFAULT now(),
  id         uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  PRIMARY KEY (inserted_at, id)
) PARTITION BY RANGE (inserted_at);
CREATE TABLE IF NOT EXISTS realtime.messages_default
  PARTITION OF realtime.messages DEFAULT;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- `realtime.topic()` is what the realtime server sets per channel join.
CREATE OR REPLACE FUNCTION realtime.topic() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('realtime.topic', true), '')::text $$;

-- Migrations do `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role, postgres;
GRANT ALL ON realtime.messages TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON realtime.messages TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA realtime TO anon, authenticated, service_role, postgres;

-- ── migration history table (same shape apply-migrations.sh records into) ──
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text
);

-- Default privileges so objects the migrations create are reachable by the
-- roles their proofs switch into, exactly as on a real Supabase project.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
  log "ready: postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
}

case "${1:-env}" in
  up)    cmd_up ;;
  down)  cmd_down ;;
  reset) cmd_reset ;;
  env)   cmd_env ;;
  psql)  shift; psql -X -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" "$@" ;;
  *)     echo "usage: local-postgres.sh {up|down|reset|env|psql}" >&2; exit 2 ;;
esac
