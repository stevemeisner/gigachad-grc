import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { PrismaClient } from '@prisma/client';
import { UserContext, UserRole } from '../types';

/**
 * The only authentication guard in the system.
 *
 * WHAT THE TOKEN IS ALLOWED TO SAY
 * --------------------------------
 * A Firebase ID token proves ONE thing: which Google account is calling.
 * Everything an authorization decision depends on -- organization, role,
 * account status -- is read from PostgreSQL on every (uncached) request.
 *
 * Firebase custom claims were rejected deliberately: they are capped at
 * 1000 bytes and only reach the client when the ID token is refreshed, which
 * is up to an hour away. A user whose admin role is revoked in the database
 * would keep acting as an admin until their token rolled over. In a
 * compliance product that is not an acceptable window.
 *
 * DEMO MODE
 * ---------
 * `AUTH_MODE=demo` is the single bypass, and it still loads its identity out
 * of PostgreSQL through the same `resolveIdentity` call a real Google login
 * uses. Only token verification is skipped, so demo and production cannot
 * drift apart in how they build a `UserContext`. It hard-throws under
 * `NODE_ENV=production`.
 */

/**
 * Firebase's JWKS endpoint for ID tokens.
 *
 * Google's "verify ID tokens" documentation points at
 * `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`,
 * which serves X.509 PEM certificates. `jwks-rsa` cannot parse that shape --
 * it expects a JWK Set. The `/jwk/` endpoint below is the same key material
 * published as JWKS. Do not "fix" this URL to match the documentation page.
 */
export const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** Only Google sign-in is accepted; Firebase reports it under this id. */
const REQUIRED_SIGN_IN_PROVIDER = 'google.com';

/** Tolerance for clock drift between this host and Google, in seconds. */
const CLOCK_SKEW_SECONDS = 60;

/** How long a resolved database identity may be reused. */
const IDENTITY_CACHE_TTL_MS = 30_000;

/** Above this many entries the cache is swept of expired rows on write. */
const IDENTITY_CACHE_SWEEP_AT = 500;

/**
 * The demo identity. These values are created by `database/dev-bootstrap.sql`
 * and must stay in sync with it.
 */
const DEMO_EXTERNAL_ID = 'demo-user';
const DEMO_EMAIL = 'john.doe@example.com';
const DEMO_USER_ID = '8f88a42b-e799-455c-b68a-308d7d2e9aa4';
const DEMO_ORGANIZATION_ID = '8924f0c1-7bb1-4be8-84ee-ad8725c712bf';

/**
 * The claims a Firebase ID token actually carries.
 *
 * Note the absence of `hd`: Firebase does not forward Google's hosted-domain
 * claim, so a company-domain restriction has to be made on the `email` suffix
 * (plus the requirement that a row exist in `users`). See `ALLOWED_EMAIL_DOMAINS`.
 */
export interface FirebaseIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  auth_time: number;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
    identities?: Record<string, unknown>;
  };
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

interface CachedIdentity {
  context: UserContext;
  expiresAt: number;
}

/**
 * Identity cache, keyed by Firebase `sub`.
 *
 * Module-level so that every guard instance across a service shares it. The
 * token is still verified cryptographically on every request; only the
 * database round trip is skipped, and only for `IDENTITY_CACHE_TTL_MS`.
 */
const identityCache = new Map<string, CachedIdentity>();

/**
 * Prisma client owned by this guard.
 *
 * Deliberately not injected: the guard is used by six services whose Prisma
 * modules are wired differently, and a guard that needs DI wiring is a guard
 * someone forgets to wire. Lazily created and module-level so that N guard
 * registrations do not open N connection pools.
 */
let sharedPrisma: PrismaClient | null = null;
function db(): PrismaClient {
  if (!sharedPrisma) {
    sharedPrisma = new PrismaClient();
  }
  return sharedPrisma;
}

function assertDemoModeIsNotProduction(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    throw new Error(
      'SECURITY ERROR: AUTH_MODE=demo is set but NODE_ENV is production. ' +
        'Demo mode accepts every request as an administrator. ' +
        'Unset AUTH_MODE and configure FIREBASE_PROJECT_ID instead.',
    );
  }
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  private readonly demoMode: boolean;
  private readonly projectId: string;
  private readonly jwks: jwksRsa.JwksClient | null;
  private readonly allowedDomains: string[];
  private readonly autoProvision: boolean;
  private readonly defaultOrganizationId: string;

  constructor() {
    this.demoMode = process.env.AUTH_MODE === 'demo';
    this.allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
      .split(',')
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
      .filter((domain) => domain.length > 0);
    this.autoProvision = process.env.AUTH_AUTO_PROVISION === 'true';
    this.defaultOrganizationId = process.env.AUTH_DEFAULT_ORG_ID || '';

    if (this.autoProvision && !this.defaultOrganizationId) {
      throw new Error(
        'AUTH_AUTO_PROVISION=true requires AUTH_DEFAULT_ORG_ID to name the ' +
          'organization new accounts join. Refusing to guess.',
      );
    }

    if (this.demoMode) {
      // Fail at boot, not on the first request.
      assertDemoModeIsNotProduction();
      this.projectId = '';
      this.jwks = null;
      this.logger.warn(
        'AUTH_MODE=demo: token verification is disabled and every request is ' +
          `served as ${DEMO_EMAIL}. Never use this outside development.`,
      );
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        'FIREBASE_PROJECT_ID is not set. It is required to validate the ' +
          'issuer and audience of Firebase ID tokens; there is no safe default.',
      );
    }
    this.projectId = projectId;

    this.jwks = jwksRsa({
      jwksUri: FIREBASE_JWKS_URL,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600_000, // 10 minutes; Google rotates these keys daily.
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // (a) The single bypass.
    if (this.demoMode) {
      assertDemoModeIsNotProduction();
      request.user = await this.loadDemoIdentity();
      return true;
    }

    // (b) Bearer token.
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'No bearer token on the request. Send an Authorization: Bearer <Firebase ID token> header.',
      );
    }

    // (c) Cryptographic verification.
    const payload = await this.verifyIdToken(token);

    // (d) Claim assertions, each with its own message.
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('Token has no subject (sub) claim.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      typeof payload.auth_time !== 'number' ||
      !Number.isFinite(payload.auth_time) ||
      payload.auth_time > nowSeconds + CLOCK_SKEW_SECONDS
    ) {
      throw new UnauthorizedException(
        'Token auth_time is missing or in the future; the sign-in it claims has not happened.',
      );
    }

    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Token email address is not verified.');
    }

    if (payload.firebase?.sign_in_provider !== REQUIRED_SIGN_IN_PROVIDER) {
      throw new UnauthorizedException(
        `Sign-in provider "${payload.firebase?.sign_in_provider ?? 'unknown'}" is not accepted. ` +
          'Sign in with Google.',
      );
    }

    if (typeof payload.email !== 'string' || payload.email.length === 0) {
      throw new UnauthorizedException('Token has no email claim.');
    }
    const email = payload.email.toLowerCase();

    // (e) Domain allowlist. Firebase omits Google's `hd` claim, so the email
    // suffix is the only signal available -- which is why a matching row in
    // `users` is also required below.
    this.assertDomainAllowed(email);

    // (f)(g)(h)(i) Identity comes from the database, not the token.
    request.user = await this.resolveIdentity({
      externalId: payload.sub,
      email,
      displayName: payload.name,
      allowAutoProvision: true,
      missingUserError: () =>
        new UnauthorizedException(
          `No account is provisioned for ${email}. Ask an administrator to invite you.`,
        ),
    });

    return true;
  }

  /**
   * Demo identity, loaded through the same resolution path as a real login so
   * the two cannot diverge. Auto-provisioning is off here on purpose: a
   * missing row means the developer skipped the bootstrap step, and inventing
   * the row would hide that.
   */
  private async loadDemoIdentity(): Promise<UserContext> {
    return this.resolveIdentity({
      externalId: DEMO_EXTERNAL_ID,
      email: DEMO_EMAIL,
      allowAutoProvision: false,
      missingUserError: () =>
        new Error(
          `AUTH_MODE=demo but the demo user (${DEMO_USER_ID} / ${DEMO_EMAIL}) is ` +
            'not in the database. Apply database/dev-bootstrap.sql against ' +
            'DATABASE_URL, which also creates organization ' +
            `${DEMO_ORGANIZATION_ID}.`,
        ),
    });
  }

  private async verifyIdToken(token: string): Promise<FirebaseIdTokenPayload> {
    if (!this.jwks) {
      // Unreachable: the constructor either builds a client or throws.
      throw new Error('FirebaseAuthGuard was not initialized for token verification.');
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
      throw new UnauthorizedException('Token is not a signed JWT with a key id.');
    }
    if (decoded.header.alg !== 'RS256') {
      throw new UnauthorizedException(
        `Token algorithm "${decoded.header.alg}" is not accepted; Firebase ID tokens are RS256.`,
      );
    }

    let signingKey: string;
    try {
      const key = await this.jwks.getSigningKey(decoded.header.kid);
      signingKey = key.getPublicKey();
    } catch (error) {
      this.logger.error(
        `Could not fetch Firebase signing key ${decoded.header.kid}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      throw new UnauthorizedException('Could not verify the token signing key.');
    }

    try {
      return jwt.verify(token, signingKey, {
        algorithms: ['RS256'],
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
        clockTolerance: CLOCK_SKEW_SECONDS,
      }) as FirebaseIdTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Firebase ID token has expired.');
      }
      throw new UnauthorizedException(
        `Firebase ID token is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private assertDomainAllowed(email: string): void {
    if (this.allowedDomains.length === 0) {
      return;
    }
    const domain = email.slice(email.lastIndexOf('@') + 1);
    if (!this.allowedDomains.includes(domain)) {
      throw new ForbiddenException(
        `Email domain "${domain}" is not permitted to access this deployment.`,
      );
    }
  }

  /**
   * Turn a verified identity into a `UserContext` built entirely from the
   * `users` row.
   */
  private async resolveIdentity(args: {
    externalId: string;
    email: string;
    displayName?: string;
    allowAutoProvision: boolean;
    missingUserError: () => Error;
  }): Promise<UserContext> {
    const cached = identityCache.get(args.externalId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }

    const prisma = db();

    // (f) Primary lookup: the stable external subject.
    let user = await prisma.user.findUnique({
      where: { externalId: args.externalId },
      select: userSelection,
    });

    // (f) Pre-provisioned accounts are created by email before their owner
    // has ever signed in, so they carry no external id yet. Claim the row on
    // first login. Safe because the email came from a verified token.
    if (!user) {
      const byEmail = await prisma.user.findFirst({
        where: { email: args.email },
        select: userSelection,
      });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { externalId: args.externalId },
          select: userSelection,
        });
      }
    }

    // (g) Auto-provisioning is opt-in and only ever reached after the domain
    // allowlist has passed.
    if (!user && args.allowAutoProvision && this.autoProvision) {
      user = await prisma.user.create({
        data: {
          externalId: args.externalId,
          email: args.email,
          organizationId: this.defaultOrganizationId,
          role: 'viewer',
          ...splitName(args.displayName, args.email),
        },
        select: userSelection,
      });
      this.logger.log(`Auto-provisioned ${args.email} as viewer.`);
    }

    if (!user) {
      throw args.missingUserError();
    }

    // (h) A suspended account holds a valid token but no access.
    if (user.status !== 'active') {
      throw new ForbiddenException(
        `This account is ${user.status} and cannot be used to sign in.`,
      );
    }

    // (i) Every authorization-relevant field comes from the row. `userId` is
    // the database id, never the Firebase subject: it is what every foreign
    // key in the schema points at.
    const context: UserContext = {
      userId: user.id,
      externalId: args.externalId,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role as UserRole,
      // Permission resolution is owned elsewhere; an empty list is the safe
      // default because it grants nothing.
      permissions: [],
      displayName: user.displayName,
      name: user.displayName,
    };

    cacheIdentity(args.externalId, context);

    // Last-login is telemetry. It must never delay or fail a request.
    void prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => undefined);

    return context;
  }
}

const userSelection = {
  id: true,
  email: true,
  organizationId: true,
  role: true,
  status: true,
  displayName: true,
} as const;

function cacheIdentity(externalId: string, context: UserContext): void {
  if (identityCache.size >= IDENTITY_CACHE_SWEEP_AT) {
    const now = Date.now();
    for (const [key, entry] of identityCache) {
      if (entry.expiresAt <= now) {
        identityCache.delete(key);
      }
    }
  }
  identityCache.set(externalId, {
    context,
    expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS,
  });
}

function extractBearerToken(request: { headers?: Record<string, unknown> }): string | null {
  const header = request.headers?.authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }
  return token.trim() || null;
}

/**
 * `firstName`, `lastName` and `displayName` are required columns, so a
 * provisioned account needs values for them even when Google sends no name.
 */
function splitName(
  displayName: string | undefined,
  email: string,
): { firstName: string; lastName: string; displayName: string } {
  const full = (displayName || '').trim() || email.slice(0, email.indexOf('@'));
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || full,
    lastName: parts.slice(1).join(' '),
    displayName: full,
  };
}
