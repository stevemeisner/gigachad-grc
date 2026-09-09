import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Resource, Action } from '../permissions/dto/permission.dto';
import { ConfigAsCodeService } from './config-as-code.service';
import {
  ExportConfigDto,
  ExportConfigResponseDto,
} from './dto/export-config.dto';
import {
  ImportConfigDto,
  ImportConfigResponseDto,
} from './dto/import-config.dto';

@ApiTags('config-as-code')
@ApiBearerAuth()
@Controller('api/config-as-code')
@UseGuards(FirebaseAuthGuard, PermissionGuard)
export class ConfigAsCodeController {
  constructor(private readonly configAsCodeService: ConfigAsCodeService) {}

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export current GRC state to configuration format' })
  @ApiResponse({
    status: 200,
    description: 'Configuration exported successfully',
    type: ExportConfigResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @RequirePermission(Resource.SETTINGS, Action.UPDATE)
  async exportConfig(
    @Request() req: any,
    @Body() dto: ExportConfigDto,
  ): Promise<ExportConfigResponseDto> {
    return this.configAsCodeService.exportConfig(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import configuration and apply changes' })
  @ApiResponse({
    status: 200,
    description: 'Configuration imported successfully',
    type: ImportConfigResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration format' })
  @RequirePermission(Resource.SETTINGS, Action.UPDATE)
  async importConfig(
    @Request() req: any,
    @Body() dto: ImportConfigDto,
  ): Promise<ImportConfigResponseDto> {
    return this.configAsCodeService.importConfig(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}

