import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditAIService } from './audit-ai.service';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';
import {
  CategorizeFindingDto,
  FindingCategorizationResult,
  AnalyzeGapsDto,
  GapAnalysisResult,
  SuggestRemediationDto,
  RemediationSuggestion,
  MapControlsDto,
  ControlMappingResult,
  GenerateSummaryDto,
  AuditSummary,
} from './dto/audit-ai.dto';

@ApiTags('Audit AI')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('audit-ai')
export class AuditAIController {
  constructor(private readonly auditAIService: AuditAIService) {}

  @Post('categorize-finding')
  @ApiOperation({ summary: 'AI-categorize an audit finding' })
  async categorizeFinding(
    @Body() dto: CategorizeFindingDto,
    @Req() req: any,
  ): Promise<FindingCategorizationResult> {
    return this.auditAIService.categorizeFinding(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post('analyze-gaps')
  @ApiOperation({ summary: 'Analyze evidence gaps for an audit' })
  async analyzeGaps(
    @Body() dto: AnalyzeGapsDto,
    @Req() req: any,
  ): Promise<GapAnalysisResult> {
    return this.auditAIService.analyzeGaps(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post('suggest-remediation')
  @ApiOperation({ summary: 'Generate AI remediation suggestions for a finding' })
  async suggestRemediation(
    @Body() dto: SuggestRemediationDto,
    @Req() req: any,
  ): Promise<RemediationSuggestion> {
    return this.auditAIService.suggestRemediation(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post('map-controls')
  @ApiOperation({ summary: 'Map audit requests to relevant controls' })
  async mapControls(
    @Body() dto: MapControlsDto,
    @Req() req: any,
  ): Promise<ControlMappingResult> {
    return this.auditAIService.mapControls(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post('generate-summary')
  @ApiOperation({ summary: 'Generate an AI audit summary' })
  async generateSummary(
    @Body() dto: GenerateSummaryDto,
    @Req() req: any,
  ): Promise<AuditSummary> {
    return this.auditAIService.generateSummary(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }
}

