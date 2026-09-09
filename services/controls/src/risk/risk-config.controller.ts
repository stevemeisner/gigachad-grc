import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { OrgId, UserId } from '@gigachad-grc/shared';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import { RiskConfigService } from './risk-config.service';
import { UpdateRiskConfigurationDto, RiskCategoryDto } from './dto/risk-config.dto';

@Controller('api/risk-config')
@UseGuards(DevAuthGuard)
export class RiskConfigController {
  constructor(private readonly riskConfigService: RiskConfigService) {}

  /**
   * Get risk configuration for organization
   */
  @Get()
  async getConfiguration(
    @OrgId() organizationId: string,
  ) {
    return this.riskConfigService.getConfiguration(organizationId);
  }

  /**
   * Update risk configuration
   */
  @Put()
  async updateConfiguration(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Body() dto: UpdateRiskConfigurationDto,
  ) {
    return this.riskConfigService.updateConfiguration(organizationId, dto, userId);
  }

  /**
   * Reset configuration to defaults
   */
  @Post('reset')
  async resetToDefaults(
    @OrgId() organizationId: string,
    @UserId() userId: string,
  ) {
    return this.riskConfigService.resetToDefaults(organizationId, userId);
  }

  /**
   * Add a new category
   */
  @Post('categories')
  async addCategory(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Body() category: Omit<RiskCategoryDto, 'id'>,
  ) {
    return this.riskConfigService.addCategory(organizationId, category, userId);
  }

  /**
   * Remove a category
   */
  @Delete('categories/:categoryId')
  async removeCategory(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.riskConfigService.removeCategory(organizationId, categoryId, userId);
  }

  /**
   * Update risk appetite for a category
   */
  @Put('appetite/:category')
  async updateRiskAppetite(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Param('category') category: string,
    @Body() body: { level: string; description?: string },
  ) {
    return this.riskConfigService.updateRiskAppetite(
      organizationId,
      category,
      body.level,
      body.description,
      userId,
    );
  }
}

