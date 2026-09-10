import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../permissions/groups.service';
import { Prisma, UserStatus, UserRole } from '@prisma/client';
import {
  CreateUserDto,
  UpdateUserDto,
  SyncUserFromProviderDto,
  UserFilterDto,
  UserResponseDto,
  UserListResponseDto,
} from './dto/user.dto';

/**
 * Marks an account that was created by an administrator before its owner had
 * ever signed in, so no Firebase subject id existed yet. A Firebase subject is
 * a 28-character alphanumeric string and can never contain a colon, so a
 * prefixed value cannot collide with a real one. `external_id` is globally
 * unique, hence the UUID: several accounts may be waiting at once.
 */
export const PENDING_EXTERNAL_ID_PREFIX = 'pending:';

/** A `users` row loaded with the group memberships `toResponseDto` reads. */
type UserWithGroups = Prisma.UserGetPayload<{
  include: {
    groupMemberships: { include: { group: { select: { id: true; name: true } } } };
  };
}>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private groupsService: GroupsService,
  ) {}

  /**
   * Get all users with filters
   */
  async findAll(
    organizationId: string,
    filters: UserFilterDto,
    page: number = 1,
    limit: number = 50,
  ): Promise<UserListResponseDto> {
    const where: any = { organizationId };

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { displayName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.groupId) {
      where.groupMemberships = {
        some: { groupId: filters.groupId },
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          groupMemberships: {
            include: {
              group: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { displayName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map(user => this.toResponseDto(user)),
      total,
      page,
      limit,
    };
  }

  /**
   * Get a single user by ID
   */
  async findOne(id: string, organizationId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      include: {
        groupMemberships: {
          include: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toResponseDto(user);
  }

  /**
   * Get user by identity-provider subject id (for login sync)
   */
  async findByExternalId(externalId: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { externalId },
      include: {
        groupMemberships: {
          include: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return user ? this.toResponseDto(user) : null;
  }

  /**
   * Sync a user from the identity provider on login.
   * Creates the user if they don't exist, updates them if they do.
   */
  async syncFromProvider(
    organizationId: string,
    dto: SyncUserFromProviderDto,
  ): Promise<UserResponseDto> {
    const displayName = dto.firstName && dto.lastName
      ? `${dto.firstName} ${dto.lastName}`
      : dto.email.split('@')[0];

    let user = await this.prisma.user.findUnique({
      where: { externalId: dto.externalId },
    });

    if (user) {
      // Update existing user
      user = await this.prisma.user.update({
        where: { externalId: dto.externalId },
        data: {
          email: dto.email,
          firstName: dto.firstName || '',
          lastName: dto.lastName || '',
          displayName: displayName,
          lastLoginAt: new Date(),
        },
      });

      this.logger.log(`Synced existing user: ${user.email}`);
    } else {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          externalId: dto.externalId,
          organizationId,
          email: dto.email,
          firstName: dto.firstName || '',
          lastName: dto.lastName || '',
          displayName: displayName,
          role: dto.roles?.includes('admin') ? UserRole.admin : UserRole.viewer,
          lastLoginAt: new Date(),
        },
      });

      // Assign default permission group based on role
      try {
        const groups = await this.groupsService.findAll(organizationId);
        const defaultGroup = groups.find(g => 
          g.name === (dto.roles?.includes('admin') ? 'Administrator' : 'Viewer')
        );
        
        if (defaultGroup) {
          await this.groupsService.addMember(defaultGroup.id, user.id, organizationId);
        }
      } catch (error) {
        this.logger.warn(`Failed to assign default group for user ${user.email}: ${error.message}`);
      }

      this.logger.log(`Created new user from identity provider: ${user.email}`);

      // Audit log
      await this.auditService.log({
        organizationId,
        userId: user.id,
        userEmail: user.email,
        action: 'created',
        entityType: 'user',
        entityId: user.id,
        entityName: user.displayName,
        description: `User "${user.displayName}" created via identity provider sync`,
      });
    }

    return this.findOne(user.id, organizationId);
  }

  /**
   * Create a user account by hand.
   *
   * `dto.externalId` is optional, because an administrator inviting a colleague
   * does not have their Firebase subject id: Firebase issues one only on a
   * first sign-in. Such an account is stored with a pending placeholder, and
   * `FirebaseAuthGuard` claims the row on that first Google sign-in by matching
   * the verified email and overwriting the placeholder with the real subject.
   */
  async create(
    organizationId: string,
    dto: CreateUserDto,
    actorId?: string,
    actorEmail?: string,
  ): Promise<UserResponseDto> {
    // Email is unique per organization; `external_id` is unique across the
    // whole table, so its arm carries no organization filter. The arm is added
    // only when an id was actually supplied, rather than relying on Prisma
    // dropping an `undefined` comparison.
    const conflicts: Prisma.UserWhereInput[] = [{ organizationId, email: dto.email }];

    if (dto.externalId) {
      conflicts.push({ externalId: dto.externalId });
    }

    const existing = await this.prisma.user.findFirst({ where: { OR: conflicts } });

    if (existing) {
      throw new ConflictException(
        dto.externalId
          ? 'User with this email or external ID already exists'
          : 'User with this email already exists',
      );
    }

    const displayName = dto.displayName || `${dto.firstName} ${dto.lastName}`;

    const user = await this.prisma.user.create({
      data: {
        externalId: dto.externalId || `${PENDING_EXTERNAL_ID_PREFIX}${randomUUID()}`,
        organizationId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: displayName,
        role: ((dto.role) || UserRole.viewer) as any,
      },
    });

    // Audit log
    await this.auditService.log({
      organizationId,
      userId: actorId,
      userEmail: actorEmail,
      action: 'created',
      entityType: 'user',
      entityId: user.id,
      entityName: user.displayName,
      description: `Created user "${user.displayName}"`,
    });

    return this.findOne(user.id, organizationId);
  }

  /**
   * Update a user
   */
  async update(
    id: string,
    organizationId: string,
    dto: UpdateUserDto,
    actorId?: string,
    actorEmail?: string,
  ): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const displayName = dto.firstName && dto.lastName
      ? `${dto.firstName} ${dto.lastName}`
      : dto.displayName;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: displayName || existing.displayName,
        role: dto.role as UserRole | undefined,
        status: dto.status as UserStatus | undefined,
      },
    });

    // Audit log
    await this.auditService.log({
      organizationId,
      userId: actorId,
      userEmail: actorEmail,
      action: 'updated',
      entityType: 'user',
      entityId: user.id,
      entityName: user.displayName,
      description: `Updated user "${user.displayName}"`,
      changes: {
        before: { firstName: existing.firstName, lastName: existing.lastName, role: existing.role, status: existing.status },
        after: { firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status },
      },
    });

    return this.findOne(user.id, organizationId);
  }

  /**
   * Deactivate a user
   */
  async deactivate(
    id: string,
    organizationId: string,
    actorId?: string,
    actorEmail?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.inactive },
    });

    // Audit log
    await this.auditService.log({
      organizationId,
      userId: actorId,
      userEmail: actorEmail,
      action: 'deactivated',
      entityType: 'user',
      entityId: id,
      entityName: user.displayName,
      description: `Deactivated user "${user.displayName}"`,
    });
  }

  /**
   * Reactivate a user
   */
  async reactivate(
    id: string,
    organizationId: string,
    actorId?: string,
    actorEmail?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.active },
    });

    // Audit log
    await this.auditService.log({
      organizationId,
      userId: actorId,
      userEmail: actorEmail,
      action: 'reactivated',
      entityType: 'user',
      entityId: id,
      entityName: user.displayName,
      description: `Reactivated user "${user.displayName}"`,
    });
  }

  /**
   * Get user statistics
   */
  async getStats(organizationId: string) {
    const [total, active, inactive, byRole] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.user.count({ where: { organizationId, status: UserStatus.active } }),
      this.prisma.user.count({ where: { organizationId, status: UserStatus.inactive } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { organizationId },
        _count: true,
      }),
    ]);

    return {
      total,
      active,
      inactive,
      byRole: byRole.map(r => ({ role: r.role, count: r._count })),
    };
  }

  /**
   * Convert user entity to response DTO.
   *
   * `lastLoginAt` is the signal for `hasSignedIn`: the guard stamps it on every
   * resolved request, so it is set from the first one onwards. A pending
   * placeholder is withheld — it is bookkeeping, not the person's identity.
   */
  private toResponseDto(user: UserWithGroups): UserResponseDto {
    const isPending = user.externalId.startsWith(PENDING_EXTERNAL_ID_PREFIX);

    return {
      id: user.id,
      externalId: isPending ? undefined : user.externalId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt || undefined,
      hasSignedIn: !!user.lastLoginAt,
      groups: user.groupMemberships.map(m => ({
        id: m.group.id,
        name: m.group.name,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}



