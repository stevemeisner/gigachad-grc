import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';
import {
  CreateAuditTemplateDto,
  UpdateAuditTemplateDto,
  CreateAuditFromTemplateDto,
  UpdateChecklistProgressDto,
} from './dto/template.dto';

@ApiTags('Audit Templates')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @ApiOperation({ summary: 'Create an audit template' })
  async create(
    @Body() dto: CreateAuditTemplateDto,
    @Req() req: any,
  ) {
    return this.templatesService.create(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List audit templates' })
  @ApiQuery({ name: 'auditType', required: false })
  @ApiQuery({ name: 'framework', required: false })
  @ApiQuery({ name: 'includeSystem', required: false, type: Boolean })
  async findAll(
    @Query('auditType') auditType?: string,
    @Query('framework') framework?: string,
    @Query('includeSystem') includeSystem?: string,
    @Req() req?: any,
  ) {
    return this.templatesService.findAll(req.user.organizationId, {
      auditType,
      framework,
      includeSystem: includeSystem !== 'false',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an audit template' })
  async findOne(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.templatesService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an audit template' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAuditTemplateDto,
    @Req() req: any,
  ) {
    return this.templatesService.update(id, req.user.organizationId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete (archive) an audit template' })
  async delete(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.templatesService.delete(id, req.user.organizationId);
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clone an audit template' })
  async clone(
    @Param('id') id: string,
    @Body() body: { name?: string },
    @Req() req: any,
  ) {
    return this.templatesService.cloneTemplate(
      id,
      req.user.organizationId,
      body.name || '',
      req.user.userId,
    );
  }

  @Post('create-audit')
  @ApiOperation({ summary: 'Create an audit from a template' })
  async createAuditFromTemplate(
    @Body() dto: CreateAuditFromTemplateDto,
    @Req() req: any,
  ) {
    return this.templatesService.createAuditFromTemplate(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get(':auditId/checklist')
  @ApiOperation({ summary: 'Get checklist status for an audit' })
  async getChecklistStatus(
    @Param('auditId') auditId: string,
    @Req() req: any,
  ) {
    return this.templatesService.getChecklistStatus(auditId, req.user.organizationId);
  }

  @Put(':auditId/checklist')
  @ApiOperation({ summary: 'Update checklist item progress' })
  async updateChecklistProgress(
    @Param('auditId') auditId: string,
    @Body() dto: UpdateChecklistProgressDto,
    @Req() req: any,
  ) {
    return this.templatesService.updateChecklistProgress(
      auditId,
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }
}

