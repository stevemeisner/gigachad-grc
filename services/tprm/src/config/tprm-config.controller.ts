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
import { TprmConfigService } from './tprm-config.service';
import { UpdateTprmConfigurationDto, VendorCategoryDto } from './dto/tprm-config.dto';

@Controller('tprm-config')
@UseGuards(DevAuthGuard)
export class TprmConfigController {
  constructor(private readonly tprmConfigService: TprmConfigService) {}

  /**
   * Get TPRM configuration for organization
   */
  @Get()
  async getConfiguration(
    @OrgId() organizationId: string,
  ) {
    return this.tprmConfigService.getConfiguration(organizationId);
  }

  /**
   * Get reference data (frequency options, tier labels, defaults)
   */
  @Get('reference')
  getReferenceData() {
    return this.tprmConfigService.getReferenceData();
  }

  /**
   * Update TPRM configuration
   */
  @Put()
  async updateConfiguration(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Body() dto: UpdateTprmConfigurationDto,
  ) {
    return this.tprmConfigService.updateConfiguration(organizationId, dto, userId);
  }

  /**
   * Reset configuration to defaults
   */
  @Post('reset')
  async resetToDefaults(
    @OrgId() organizationId: string,
    @UserId() userId: string,
  ) {
    return this.tprmConfigService.resetToDefaults(organizationId, userId);
  }

  /**
   * Add a new vendor category
   */
  @Post('categories')
  async addCategory(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Body() category: Omit<VendorCategoryDto, 'id'>,
  ) {
    return this.tprmConfigService.addCategory(organizationId, category, userId);
  }

  /**
   * Remove a vendor category
   */
  @Delete('categories/:categoryId')
  async removeCategory(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.tprmConfigService.removeCategory(organizationId, categoryId, userId);
  }

  /**
   * Get frequency for a specific tier
   */
  @Get('tier-frequency/:tier')
  async getTierFrequency(
    @OrgId() organizationId: string,
    @Param('tier') tier: string,
  ) {
    const frequency = await this.tprmConfigService.getFrequencyForTier(organizationId, tier);
    return { tier, frequency };
  }
}

