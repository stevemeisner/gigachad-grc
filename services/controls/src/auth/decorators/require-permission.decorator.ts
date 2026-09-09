import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Resource, Action } from '../../permissions/dto/permission.dto';
import { UserContext } from '@gigachad-grc/shared';

export const PERMISSION_KEY = 'required_permission';

export interface RequiredPermission {
  resource: Resource;
  action: Action;
  // Optional: get resource ID from request params/body for ownership checks
  resourceIdParam?: string; // e.g., 'id' to get req.params.id
}

/**
 * Decorator to require a specific permission for a route
 * 
 * @example
 * @RequirePermission(Resource.CONTROLS, Action.UPDATE)
 * async updateControl() { }
 * 
 * @example
 * // With ownership check using URL param
 * @RequirePermission(Resource.CONTROLS, Action.UPDATE, 'id')
 * async updateControl(@Param('id') id: string) { }
 */
export const RequirePermission = (
  resource: Resource,
  action: Action,
  resourceIdParam?: string,
) => SetMetadata(PERMISSION_KEY, { resource, action, resourceIdParam } as RequiredPermission);

/**
 * Decorator to require multiple permissions (OR logic - any permission passes)
 */
export const PERMISSIONS_KEY = 'required_permissions';

export const RequireAnyPermission = (...permissions: RequiredPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorator to extract the current user from the request.
 *
 * The value is whatever the route's auth guard placed on `request.user`.
 * It must NOT be rebuilt from `x-user-id` / `x-organization-id` headers:
 * those are attacker-controlled on any request that reaches the service
 * directly, so trusting them would let a caller act as any user in any
 * organization. DevAuthGuard happens to set them today, which is why the
 * old header-reading version appeared to work.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserContext =>
    ctx.switchToHttp().getRequest<{ user: UserContext }>().user,
);

