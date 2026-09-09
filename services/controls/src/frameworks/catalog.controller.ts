import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';
import { FrameworkCatalogService } from './catalog.service';

@Controller('api/frameworks/catalog')
@UseGuards(FirebaseAuthGuard)
export class FrameworkCatalogController {
  constructor(private readonly catalogService: FrameworkCatalogService) {}

  /**
   * List all available frameworks in the catalog
   */
  @Get()
  listCatalogFrameworks() {
    return this.catalogService.listAvailableFrameworks();
  }

  /**
   * Get catalog status - which frameworks are activated for the organization
   */
  @Get('status')
  async getCatalogStatus(@Req() req: any) {
    const organizationId = req.user?.organizationId || 'default-org';
    return this.catalogService.getCatalogStatus(organizationId);
  }

  /**
   * Get detailed framework with all requirements (preview before activation)
   */
  @Get(':catalogId')
  getFrameworkDetails(@Param('catalogId') catalogId: string) {
    return this.catalogService.getFrameworkDetails(catalogId);
  }

  /**
   * Activate a framework from the catalog for the organization
   */
  @Post(':catalogId/activate')
  @HttpCode(HttpStatus.CREATED)
  async activateFramework(
    @Param('catalogId') catalogId: string,
    @Req() req: any,
  ) {
    const organizationId = req.user?.organizationId || 'default-org';
    const userId = req.user?.id || req.user?.sub || 'system';
    
    return this.catalogService.activateFramework(organizationId, catalogId, userId);
  }

  /**
   * Get all activated frameworks for the organization
   */
  @Get('activated/list')
  async getActivatedFrameworks(@Req() req: any) {
    const organizationId = req.user?.organizationId || 'default-org';
    return this.catalogService.getActivatedFrameworks(organizationId);
  }

  /**
   * Check if a specific framework is activated
   */
  @Get(':catalogId/status')
  async isFrameworkActivated(
    @Param('catalogId') catalogId: string,
    @Req() req: any,
  ) {
    const organizationId = req.user?.organizationId || 'default-org';
    const isActivated = await this.catalogService.isFrameworkActivated(organizationId, catalogId);
    return { catalogId, isActivated };
  }

  /**
   * Deactivate a framework (soft-delete)
   */
  @Delete(':frameworkId/deactivate')
  async deactivateFramework(
    @Param('frameworkId') frameworkId: string,
    @Req() req: any,
  ) {
    const organizationId = req.user?.organizationId || 'default-org';
    const userId = req.user?.id || req.user?.sub || 'system';
    
    return this.catalogService.deactivateFramework(organizationId, frameworkId, userId);
  }
}
