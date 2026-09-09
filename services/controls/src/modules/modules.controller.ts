import { Controller, Get, Put, Body, UseGuards, Request, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Resource, Action } from '../permissions/dto/permission.dto';

interface UpdateModulesDto {
  enabledModules: string[];
}

@ApiTags('modules')
@ApiBearerAuth()
@Controller('api/modules')
@UseGuards(FirebaseAuthGuard, PermissionGuard)
export class ModulesController {
  private readonly logger = new Logger(ModulesController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get enabled modules for the current organization' })
  @RequirePermission(Resource.SETTINGS, Action.READ)
  async getModules(@Request() req: any) {
    const org = await this.prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: { settings: true },
    });

    const settings = (org?.settings as any) || {};
    const enabledModules = Array.isArray(settings.enabledModules)
      ? settings.enabledModules.filter(
          (m: unknown) => typeof m === 'string' && m.trim().length > 0,
        )
      : [];

    return {
      enabledModules,
    };
  }

  @Put()
  @ApiOperation({ summary: 'Update enabled modules for the current organization' })
  @RequirePermission(Resource.SETTINGS, Action.UPDATE)
  async updateModules(@Request() req: any, @Body() body: UpdateModulesDto) {
    try {
      const existing = await this.prisma.organization.findUnique({
        where: { id: req.user.organizationId },
        select: { settings: true },
      });

      if (!existing) {
        throw new Error(`Organization ${req.user.organizationId} not found`);
      }

      const oldSettings = (existing.settings as any) || {};
      const cleaned = Array.from(
        new Set((body.enabledModules || []).map((m) => m.trim()).filter(Boolean)),
      );

      const newSettings = {
        ...oldSettings,
        enabledModules: cleaned,
      };

      await this.prisma.organization.update({
        where: { id: req.user.organizationId },
        data: { settings: newSettings },
      });

      return {
        enabledModules: cleaned,
      };
    } catch (error: any) {
      this.logger.error('Error updating modules:', error);
      throw error;
    }
  }
}


