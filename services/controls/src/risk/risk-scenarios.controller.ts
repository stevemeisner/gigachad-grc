import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { OrgId, UserId } from '@gigachad-grc/shared';
import { RiskScenariosService } from './risk-scenarios.service';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Resource, Action } from '../permissions/dto/permission.dto';
import {
  CreateRiskScenarioDto,
  UpdateRiskScenarioDto,
  ListRiskScenariosQueryDto,
  CloneScenarioDto,
} from './dto/risk-scenario.dto';

@Controller('api/risk-scenarios')
@UseGuards(DevAuthGuard, PermissionGuard)
export class RiskScenariosController {
  constructor(private readonly riskScenariosService: RiskScenariosService) {}

  @Get()
  @RequirePermission(Resource.RISK, Action.READ)
  async list(
    @OrgId() organizationId: string,
    @Query(new ValidationPipe({ transform: true })) query: ListRiskScenariosQueryDto,
  ) {
    return this.riskScenariosService.listScenarios(organizationId, query);
  }

  @Get('templates')
  @RequirePermission(Resource.RISK, Action.READ)
  async getTemplates(@OrgId() organizationId: string) {
    return this.riskScenariosService.getTemplates(organizationId);
  }

  @Get('library')
  @RequirePermission(Resource.RISK, Action.READ)
  async getLibrary() {
    // Get global library templates available to all organizations
    return this.riskScenariosService.getLibraryTemplates();
  }

  @Get('library/by-category')
  @RequirePermission(Resource.RISK, Action.READ)
  async getLibraryByCategory() {
    // Get library templates grouped by category
    return this.riskScenariosService.getLibraryByCategory();
  }

  @Get('categories')
  @RequirePermission(Resource.RISK, Action.READ)
  async getCategories(@OrgId() organizationId: string) {
    return this.riskScenariosService.getCategories(organizationId);
  }

  @Get('statistics')
  @RequirePermission(Resource.RISK, Action.READ)
  async getStatistics(@OrgId() organizationId: string) {
    return this.riskScenariosService.getStatistics(organizationId);
  }

  @Get(':id')
  @RequirePermission(Resource.RISK, Action.READ)
  async get(
    @OrgId() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.riskScenariosService.getScenario(organizationId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Resource.RISK, Action.CREATE)
  async create(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Body(new ValidationPipe({ transform: true })) dto: CreateRiskScenarioDto,
  ) {
    return this.riskScenariosService.createScenario(organizationId, userId, dto);
  }

  @Put(':id')
  @RequirePermission(Resource.RISK, Action.UPDATE)
  async update(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateRiskScenarioDto,
  ) {
    return this.riskScenariosService.updateScenario(organizationId, userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Resource.RISK, Action.DELETE)
  async delete(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.riskScenariosService.deleteScenario(organizationId, userId, id);
  }

  @Post(':id/clone')
  @RequirePermission(Resource.RISK, Action.CREATE)
  async clone(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: CloneScenarioDto,
  ) {
    return this.riskScenariosService.cloneScenario(organizationId, userId, id, dto.newTitle);
  }

  @Post(':id/simulate')
  @RequirePermission(Resource.RISK, Action.UPDATE)
  async simulate(
    @OrgId() organizationId: string,
    @Param('id') id: string,
    @Body() body: { controlEffectiveness?: number; mitigations?: string[] },
  ) {
    return this.riskScenariosService.runSimulation(organizationId, id, body);
  }

  @Post('bulk/from-templates')
  @RequirePermission(Resource.RISK, Action.CREATE)
  async bulkCreateFromTemplates(
    @OrgId() organizationId: string,
    @UserId() userId: string,
    @Body() body: { templateIds: string[] },
  ) {
    return this.riskScenariosService.bulkCreateFromTemplates(
      organizationId,
      userId,
      body.templateIds,
    );
  }
}

