import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TrustConfigService, UpdateTrustConfigDto } from './trust-config.service';
import { CurrentUser, FirebaseAuthGuard, UserContext } from '@gigachad-grc/shared';

@Controller('trust-config')
@UseGuards(FirebaseAuthGuard)
export class TrustConfigController {
  constructor(private readonly configService: TrustConfigService) {}

  @Get()
  getConfiguration(@Query('organizationId') organizationId: string) {
    return this.configService.getConfiguration(organizationId || 'default-org');
  }

  @Put()
  updateConfiguration(
    @Query('organizationId') organizationId: string,
    @Body() dto: UpdateTrustConfigDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.configService.updateConfiguration(
      organizationId || 'default-org',
      dto,
      user.userId,
    );
  }

  @Post('reset')
  resetToDefaults(
    @Query('organizationId') organizationId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.configService.resetToDefaults(
      organizationId || 'default-org',
      user.userId,
    );
  }

  @Get('reference')
  getReferenceData() {
    return this.configService.getReferenceData();
  }
}

