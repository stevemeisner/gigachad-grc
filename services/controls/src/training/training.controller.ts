import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';
import { CurrentUser } from '../auth/decorators/require-permission.decorator';
import { TrainingService } from './training.service';
import {
  UpdateProgressDto,
  StartModuleDto,
  CompleteModuleDto,
  CreateAssignmentDto,
  BulkAssignDto,
  UpdateAssignmentDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/training.dto';

interface AuthUser {
  userId: string;
  organizationId: string;
  email: string;
  role: string;
}

@ApiTags('Training')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('api/training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  // ==========================================
  // Progress Endpoints
  // ==========================================

  @Get('progress')
  @ApiOperation({ summary: 'Get current user training progress' })
  async getMyProgress(@CurrentUser() user: AuthUser) {
    return this.trainingService.getProgress(user.organizationId, user.userId);
  }

  @Get('progress/:moduleId')
  @ApiOperation({ summary: 'Get progress for a specific module' })
  async getModuleProgress(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
  ) {
    return this.trainingService.getModuleProgress(
      user.organizationId,
      user.userId,
      moduleId,
    );
  }

  @Post('progress/start')
  @ApiOperation({ summary: 'Start a training module' })
  async startModule(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartModuleDto,
  ) {
    return this.trainingService.startModule(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  @Put('progress/:moduleId')
  @ApiOperation({ summary: 'Update progress for a module' })
  async updateProgress(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.trainingService.updateProgress(
      user.organizationId,
      user.userId,
      moduleId,
      dto,
    );
  }

  @Post('progress/complete')
  @ApiOperation({ summary: 'Mark a training module as complete' })
  async completeModule(
    @CurrentUser() user: AuthUser,
    @Body() dto: CompleteModuleDto,
  ) {
    return this.trainingService.completeModule(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get training statistics for current user' })
  async getMyStats(@CurrentUser() user: AuthUser) {
    return this.trainingService.getStats(user.organizationId, user.userId);
  }

  @Get('stats/org')
  @ApiOperation({ summary: 'Get organization-wide training statistics' })
  async getOrgStats(@CurrentUser() user: AuthUser) {
    return this.trainingService.getOrgStats(user.organizationId);
  }

  // ==========================================
  // Assignment Endpoints
  // ==========================================

  @Get('assignments')
  @ApiOperation({ summary: 'Get all assignments (admin) or current user assignments' })
  @ApiQuery({ name: 'userId', required: false })
  async getAssignments(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
  ) {
    // If not admin, only show own assignments
    const targetUserId = user.role === 'admin' ? userId : user.userId;
    return this.trainingService.getAssignments(user.organizationId, targetUserId);
  }

  @Get('assignments/me')
  @ApiOperation({ summary: 'Get current user assignments' })
  async getMyAssignments(@CurrentUser() user: AuthUser) {
    return this.trainingService.getAssignments(user.organizationId, user.userId);
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Create a training assignment' })
  async createAssignment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.trainingService.createAssignment(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  @Post('assignments/bulk')
  @ApiOperation({ summary: 'Bulk assign training to multiple users' })
  async bulkAssign(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAssignDto,
  ) {
    return this.trainingService.bulkAssign(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  @Put('assignments/:id')
  @ApiOperation({ summary: 'Update a training assignment' })
  async updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.trainingService.updateAssignment(
      user.organizationId,
      assignmentId,
      dto,
    );
  }

  @Delete('assignments/:id')
  @ApiOperation({ summary: 'Delete a training assignment' })
  async deleteAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id') assignmentId: string,
  ) {
    return this.trainingService.deleteAssignment(
      user.organizationId,
      assignmentId,
    );
  }

  // ==========================================
  // Campaign Endpoints
  // ==========================================

  @Get('campaigns')
  @ApiOperation({ summary: 'Get all training campaigns' })
  async getCampaigns(@CurrentUser() user: AuthUser) {
    return this.trainingService.getCampaigns(user.organizationId);
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get a specific training campaign' })
  async getCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') campaignId: string,
  ) {
    return this.trainingService.getCampaign(user.organizationId, campaignId);
  }

  @Post('campaigns')
  @ApiOperation({ summary: 'Create a training campaign' })
  async createCampaign(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.trainingService.createCampaign(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  @Put('campaigns/:id')
  @ApiOperation({ summary: 'Update a training campaign' })
  async updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') campaignId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.trainingService.updateCampaign(
      user.organizationId,
      campaignId,
      dto,
    );
  }

  @Delete('campaigns/:id')
  @ApiOperation({ summary: 'Delete a training campaign' })
  async deleteCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') campaignId: string,
  ) {
    return this.trainingService.deleteCampaign(
      user.organizationId,
      campaignId,
    );
  }
}




