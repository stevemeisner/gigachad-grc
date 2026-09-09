-- ============================================================================
-- GigaChad GRC - Development bootstrap rows
-- ============================================================================
--
-- Applied by scripts/start-demo.sh AFTER `prisma db push` has created the
-- schema. Safe to run repeatedly.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- In development every service authenticates through DevAuthGuard
-- (services/<name>/src/auth/dev-auth.guard.ts), which injects a fixed mock
-- user instead of validating a Keycloak token. The UUIDs below are hard-coded
-- in that guard and in frontend/src/contexts/AuthContext.tsx, and several
-- endpoints (notably POST /api/seed/load-demo) write rows that carry a
-- non-null foreign key to both of them.
--
-- Without these two rows the demo seeder fails with Prisma P2025
-- ("Record to update not found").
--
-- Keep these UUIDs in sync with:
--   services/*/src/auth/dev-auth.guard.ts   (mockUser.userId / organizationId)
--   frontend/src/contexts/AuthContext.tsx   (devLogin user object)
-- ============================================================================

INSERT INTO organizations (id, name, slug, updated_at)
VALUES (
    '8924f0c1-7bb1-4be8-84ee-ad8725c712bf',
    'GigaChad Demo Co',
    'default',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- `role` is set explicitly. It defaults to `viewer` in the Prisma schema, so
-- omitting it left the database describing this account as a viewer while
-- DevAuthGuard hands the very same session the `admin` role -- two sources of
-- truth disagreeing about the only user in the system.
INSERT INTO users (
    id,
    keycloak_id,
    email,
    first_name,
    last_name,
    display_name,
    role,
    organization_id,
    updated_at
)
VALUES (
    '8f88a42b-e799-455c-b68a-308d7d2e9aa4',
    'john-doe-keycloak-id',
    'john.doe@example.com',
    'John',
    'Doe',
    'John Doe',
    'admin',
    '8924f0c1-7bb1-4be8-84ee-ad8725c712bf',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
