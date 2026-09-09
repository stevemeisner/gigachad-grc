import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgId, UserId } from '@gigachad-grc/shared';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import { FindingsService } from './findings.service';
import { CreateFindingDto } from './dto/create-finding.dto';
import { UpdateFindingDto } from './dto/update-finding.dto';

@Controller('findings')
@UseGuards(DevAuthGuard)
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Post()
  create(
    @Body() createFindingDto: CreateFindingDto,
    @UserId() userId: string,
  ) {
    return this.findingsService.create(createFindingDto, userId);
  }

  @Get()
  findAll(
    @OrgId() organizationId: string,
    @Query('auditId') auditId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('remediationOwner') remediationOwner?: string,
  ) {
    return this.findingsService.findAll(organizationId, {
      auditId,
      status,
      severity,
      category,
      remediationOwner,
    });
  }

  @Get('stats')
  getStats(@OrgId() organizationId: string) {
    return this.findingsService.getStats(organizationId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @OrgId() organizationId: string,
  ) {
    return this.findingsService.findOne(id, organizationId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @OrgId() organizationId: string,
    @Body() updateFindingDto: UpdateFindingDto,
  ) {
    return this.findingsService.update(id, organizationId, updateFindingDto);
  }

  @Delete(':id')
  delete(
    @Param('id') id: string,
    @OrgId() organizationId: string,
  ) {
    return this.findingsService.delete(id, organizationId);
  }

  @Post('bulk/status')
  bulkUpdateStatus(
    @OrgId() organizationId: string,
    @Body() body: { ids: string[]; status: string },
  ) {
    return this.findingsService.bulkUpdateStatus(body.ids, organizationId, body.status);
  }
}





