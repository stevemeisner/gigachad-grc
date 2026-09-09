import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserContext } from '../types';

/**
 * Parameter decorators that expose the authenticated caller's identity.
 *
 * WHY THESE EXIST
 * ---------------
 * Controllers used to take identity straight off the wire:
 *
 *     findAll(@Headers('x-organization-id') organizationId: string)
 *
 * Those headers are supplied by the client. Anyone who could reach a service
 * could name any organization and read or write its data, because the value
 * was passed unchecked into the query. It only looked safe because the
 * since-removed DevAuthGuard overwrote those headers on the way in.
 *
 * These decorators read `request.user`, which is populated by the route's
 * auth guard from a verified token and cannot be influenced by the caller.
 * They intentionally keep the same `string` shape as the header decorators
 * they replace, so swapping them in is a one-line change per parameter.
 *
 * A route using these MUST be behind an auth guard. If it is not,
 * `request.user` is undefined and the decorator fails closed with 401 rather
 * than silently handing the handler `undefined` — which would previously have
 * widened a query to every organization.
 */

function requireUser(ctx: ExecutionContext): UserContext {
  const user = ctx.switchToHttp().getRequest<{ user?: UserContext }>().user;
  if (!user) {
    throw new UnauthorizedException(
      'No authenticated user on this request. The route is missing an auth guard.',
    );
  }
  return user;
}

/** The caller's organization id. Replaces `@Headers('x-organization-id')`. */
export const OrgId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => requireUser(ctx).organizationId,
);

/** The caller's user id. Replaces `@Headers('x-user-id')`. */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => requireUser(ctx).userId,
);

/** The caller's email address. Replaces `@Headers('x-user-email')`. */
export const UserEmail = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => requireUser(ctx).email,
);

/** The whole verified identity, for handlers that need more than one field. */
export const AuthUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserContext => requireUser(ctx),
);
