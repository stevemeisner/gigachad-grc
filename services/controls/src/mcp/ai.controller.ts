import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MCPWorkflowService } from './mcp-workflow.service';
import { CurrentUser, FirebaseAuthGuard, UserContext } from '@gigachad-grc/shared';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Resource, Action } from '../permissions/dto/permission.dto';

class AnalyzeRiskDto {
  description: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, PermissionGuard)
@Controller('api/mcp/ai')
export class AIController {
  constructor(private readonly workflows: MCPWorkflowService) {}

  @Post('analyze-risk')
  @ApiOperation({ summary: 'Analyze a risk description using the AI assistant' })
  @RequirePermission(Resource.AI, Action.UPDATE)
  async analyzeRisk(
    @CurrentUser() _user: UserContext,
    @Body() body: AnalyzeRiskDto,
  ): Promise<{
    summary: string;
    suggestedCategory?: string;
    suggestedLikelihood?: string;
    suggestedImpact?: string;
    suggestedTreatmentPlan?: string;
  }> {
    const execution = await this.workflows.executeWorkflow('risk-assessment', {
      riskDescription: body.description,
    });

    // The workflow execution runs asynchronously; in a real implementation
    // we would persist and poll. For now, return a simple stub response
    // to avoid blocking while still wiring the end-to-end flow.
    return {
      summary:
        'AI analysis is being processed in the background. This preview does not yet include live model output but confirms the workflow is wired.',
    };
  }
}


