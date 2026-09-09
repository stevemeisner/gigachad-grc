-- ============================================================================
-- Create a dedicated database for Keycloak
-- ============================================================================
--
-- Mounted into /docker-entrypoint-initdb.d, so this runs exactly once, when
-- the postgres volume is first created.
--
-- WHY THIS IS SEPARATE
-- --------------------
-- Keycloak creates roughly 90 tables of its own (user_entity, redirect_uris,
-- realm_events_listeners, ...). If it shares a database and schema with the
-- application, those tables land in `public` alongside the Prisma-managed
-- ones. Prisma then considers them foreign and every `prisma db push` offers
-- to DROP them -- which would delete the realm, its clients and its users.
--
-- Keeping Keycloak in its own database means `db push` only ever sees tables
-- it owns, and no schema operation on the app database can destroy identity
-- data.
--
-- Idempotent: CREATE DATABASE has no IF NOT EXISTS, so it is generated
-- conditionally and executed with psql's \gexec.
-- ============================================================================

SELECT format('CREATE DATABASE %I OWNER %I', 'keycloak', current_user)
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'keycloak'
)\gexec
