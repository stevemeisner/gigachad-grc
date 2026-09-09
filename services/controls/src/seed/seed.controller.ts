import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { SeedDataService } from './seed.service';
import { ResetDataService } from './reset.service';
import { AuthUser, FirebaseAuthGuard, type UserContext } from '@gigachad-grc/shared';

interface ResetDto {
  confirmationPhrase: string;
}

@ApiTags('Demo Data')
@Controller('api/seed')
@UseGuards(FirebaseAuthGuard)
export class SeedController {
  constructor(
    private readonly seedService: SeedDataService,
    private readonly resetService: ResetDataService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Check demo data status' })
  async getStatus(@AuthUser() user: UserContext) {
    const [isDemoLoaded, hasData, dataSummary] = await Promise.all([
      this.seedService.isDemoDataLoaded(user.organizationId),
      this.seedService.hasExistingData(user.organizationId),
      this.resetService.getDataSummary(user.organizationId),
    ]);

    return {
      demoDataLoaded: isDemoLoaded,
      hasExistingData: hasData,
      dataSummary,
    };
  }

  @Post('load-demo')
  @ApiOperation({ summary: 'Load demo data into the organization' })
  async loadDemoData(@AuthUser() user: UserContext) {
    // Check if user is admin
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Only administrators can load demo data');
    }

    return this.seedService.loadDemoData(user.organizationId, user.userId);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset all organization data' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        confirmationPhrase: {
          type: 'string',
          description: 'Must be exactly "DELETE ALL DATA"',
        },
      },
      required: ['confirmationPhrase'],
    },
  })
  async resetData(@AuthUser() user: UserContext, @Body() dto: ResetDto) {
    // Check if user is admin
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Only administrators can reset data');
    }

    return this.resetService.resetOrganizationData(
      user.organizationId,
      user.userId,
      dto.confirmationPhrase,
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get data summary for reset confirmation' })
  async getDataSummary(@AuthUser() user: UserContext) {
    return this.resetService.getDataSummary(user.organizationId);
  }

  private isAdmin(user: UserContext): boolean {
    // Check if user has admin or super_admin role
    const adminRoles = ['admin', 'super_admin', 'owner'];
    return adminRoles.includes(user.role || '');
  }
}

