-- ============================================================================
-- GigaChad GRC - Development bootstrap rows
-- ============================================================================
--
-- Applied by scripts/start-demo.sh AFTER `prisma db push` has created the
-- schema. Safe to run repeatedly.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- With AUTH_MODE=demo, FirebaseAuthGuard skips token verification but still
-- loads its identity out of this database through the same code path a real
-- Google sign-in uses (services/shared/src/auth/firebase-auth.guard.ts).
-- Without the two rows below the guard refuses every request, and the demo
-- seeder (POST /api/seed/load-demo) fails with Prisma P2025
-- ("Record to update not found") because its rows carry non-null foreign
-- keys to both of them.
--
-- Keep these values in sync with:
--   services/shared/src/auth/firebase-auth.guard.ts
--       (DEMO_EXTERNAL_ID / DEMO_EMAIL / DEMO_USER_ID / DEMO_ORGANIZATION_ID)
--   frontend/src/contexts/AuthContext.tsx   (demo user object)
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
-- omitting it left the database describing this account as a viewer while the
-- demo session behaved as an admin -- two sources of truth disagreeing about
-- the only user in the system. The guard now reads the role from this row, so
-- this value is the single answer.
INSERT INTO users (
    id,
    external_id,
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
    'demo-user',
    'john.doe@example.com',
    'John',
    'Doe',
    'John Doe',
    'admin',
    '8924f0c1-7bb1-4be8-84ee-ad8725c712bf',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    external_id = EXCLUDED.external_id;
