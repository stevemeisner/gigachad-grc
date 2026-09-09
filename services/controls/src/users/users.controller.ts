import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard, OrgId, UserEmail, UserId } from '@gigachad-grc/shared';
import { UsersService } from './users.service';
import { PermissionsService } from '../permissions/permissions.service';
import { GroupsService } from '../permissions/groups.service';
import {
  CreateUserDto,
  UpdateUserDto,
  SyncUserFromProviderDto,
  UserFilterDto,
} from './dto/user.dto';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Resource, Action } from '../permissions/dto/permission.dto';
import { PaginationLimitPipe, PaginationPagePipe } from '../common/pagination.pipe';

@Controller('api/users')
@UseGuards(FirebaseAuthGuard, PermissionGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly groupsService: GroupsService,
  ) {}

  // ===========================
  // User CRUD
  // ===========================

  @Get()
  @RequirePermission(Resource.USERS, Action.READ)
  async listUsers(
    @Query() filters: UserFilterDto,
    @Query('page', new PaginationPagePipe()) page: number,
    @Query('limit', new PaginationLimitPipe({ default: 50 })) limit: number,
    @OrgId() orgId: string,
  ) {
    return this.usersService.findAll(orgId, filters, page, limit);
  }

  @Get('stats')
  @RequirePermission(Resource.USERS, Action.READ)
  async getUserStats(
    @OrgId() orgId: string,
  ) {
    return this.usersService.getStats(orgId);
  }

  @Get('me')
  async getCurrentUser(
    @UserId() userId: string,
    @OrgId() orgId: string,
  ) {
    if (!userId) {
      return null;
    }
    
    try {
      const user = await this.usersService.findOne(userId, orgId);
      const permissions = await this.permissionsService.getUserPermissions(userId, orgId);
      return { ...user, permissions };
    } catch {
      return null;
    }
  }

  @Get(':id')
  @RequirePermission(Resource.USERS, Action.READ)
  async getUser(
    @Param('id') id: string,
    @OrgId() orgId: string,
  ) {
    return this.usersService.findOne(id, orgId);
  }

  @Get(':id/permissions')
  @RequirePermission(Resource.USERS, Action.READ)
  async getUserPermissions(
    @Param('id') id: string,
    @OrgId() orgId: string,
  ) {
    return this.permissionsService.getUserPermissions(id, orgId);
  }

  @Post()
  @RequirePermission(Resource.USERS, Action.CREATE)
  async createUser(
    @Body() dto: CreateUserDto,
    @OrgId() orgId: string,
    @UserId() actorId?: string,
    @UserEmail() actorEmail?: string,
  ) {
    return this.usersService.create(orgId, dto, actorId, actorEmail);
  }

  @Put(':id')
  @RequirePermission(Resource.USERS, Action.UPDATE)
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @OrgId() orgId: string,
    @UserId() actorId?: string,
    @UserEmail() actorEmail?: string,
  ) {
    return this.usersService.update(id, orgId, dto, actorId, actorEmail);
  }

  @Post(':id/deactivate')
  @RequirePermission(Resource.USERS, Action.UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateUser(
    @Param('id') id: string,
    @OrgId() orgId: string,
    @UserId() actorId?: string,
    @UserEmail() actorEmail?: string,
  ) {
    await this.usersService.deactivate(id, orgId, actorId, actorEmail);
  }

  @Post(':id/reactivate')
  @RequirePermission(Resource.USERS, Action.UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivateUser(
    @Param('id') id: string,
    @OrgId() orgId: string,
    @UserId() actorId?: string,
    @UserEmail() actorEmail?: string,
  ) {
    await this.usersService.reactivate(id, orgId, actorId, actorEmail);
  }

  // ===========================
  // User Groups
  // ===========================

  @Get(':id/groups')
  @RequirePermission(Resource.USERS, Action.READ)
  async getUserGroups(
    @Param('id') id: string,
    @OrgId() orgId: string,
  ) {
    const user = await this.usersService.findOne(id, orgId);
    return user.groups;
  }

  @Post(':id/groups/:groupId')
  @RequirePermission(Resource.PERMISSIONS, Action.UPDATE)
  @HttpCode(HttpStatus.CREATED)
  async addUserToGroup(
    @Param('id') userId: string,
    @Param('groupId') groupId: string,
    @OrgId() orgId: string,
    @UserId() actorId?: string,
    @UserEmail() actorEmail?: string,
  ) {
    await this.groupsService.addMember(groupId, userId, orgId, actorId, actorEmail);
    return { success: true };
  }

  @Post(':id/groups/:groupId/remove')
  @RequirePermission(Resource.PERMISSIONS, Action.UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeUserFromGroup(
    @Param('id') userId: string,
    @Param('groupId') groupId: string,
    @OrgId() orgId: string,
    @UserId() actorId?: string,
    @UserEmail() actorEmail?: string,
  ) {
    await this.groupsService.removeMember(groupId, userId, orgId, actorId, actorEmail);
  }

  // ===========================
  // Identity Provider Sync
  // ===========================

  @Post('sync')
  async syncFromProvider(
    @Body() dto: SyncUserFromProviderDto,
    @OrgId() orgId: string,
  ) {
    return this.usersService.syncFromProvider(orgId, dto);
  }

  @Get('external/:externalId')
  async getUserByExternalId(@Param('externalId') externalId: string) {
    return this.usersService.findByExternalId(externalId);
  }
}



