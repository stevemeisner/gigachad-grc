import { Controller, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';

@ApiTags('Audit Analytics')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get audit dashboard metrics' })
  getDashboard(@Req() req: any) {
    return this.analyticsService.getDashboard(req.user.organizationId);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get audit trends over time' })
  getTrends(@Query('period') period: 'monthly' | 'quarterly' | 'yearly', @Req() req: any) {
    return this.analyticsService.getTrends(req.user.organizationId, period);
  }

  @Get('findings')
  @ApiOperation({ summary: 'Get finding analytics' })
  getFindingAnalytics(@Req() req: any) {
    return this.analyticsService.getFindingAnalytics(req.user.organizationId);
  }

  @Get('coverage')
  @ApiOperation({ summary: 'Get test coverage metrics' })
  getCoverageMetrics(@Query('auditId') auditId: string, @Req() req: any) {
    return this.analyticsService.getCoverageMetrics(req.user.organizationId, auditId);
  }

  @Post('snapshot')
  @ApiOperation({ summary: 'Create analytics snapshot' })
  createSnapshot(@Query('type') type: string, @Req() req: any) {
    return this.analyticsService.createSnapshot(req.user.organizationId, type || 'daily');
  }
}

