import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TestProceduresService, CreateTestProcedureDto, UpdateTestProcedureDto, RecordTestResultDto } from './test-procedures.service';
import { FirebaseAuthGuard } from '@gigachad-grc/shared';

@ApiTags('Test Procedures')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('test-procedures')
export class TestProceduresController {
  constructor(private readonly testProceduresService: TestProceduresService) {}

  @Post()
  @ApiOperation({ summary: 'Create a test procedure' })
  create(@Body() dto: CreateTestProcedureDto, @Req() req: any) {
    return this.testProceduresService.create(req.user.organizationId, dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List test procedures' })
  findAll(@Query('auditId') auditId: string, @Query('controlId') controlId: string, @Req() req: any) {
    return this.testProceduresService.findAll(req.user.organizationId, auditId, controlId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get test procedure statistics' })
  getStats(@Query('auditId') auditId: string, @Req() req: any) {
    return this.testProceduresService.getStats(req.user.organizationId, auditId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a test procedure' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.testProceduresService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a test procedure' })
  update(@Param('id') id: string, @Body() dto: UpdateTestProcedureDto, @Req() req: any) {
    return this.testProceduresService.update(id, req.user.organizationId, dto);
  }

  @Post(':id/record-result')
  @ApiOperation({ summary: 'Record test result' })
  recordResult(@Param('id') id: string, @Body() dto: RecordTestResultDto, @Req() req: any) {
    return this.testProceduresService.recordResult(id, req.user.organizationId, dto, req.user.userId);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Review test procedure' })
  review(@Param('id') id: string, @Body() body: { notes: string }, @Req() req: any) {
    return this.testProceduresService.review(id, req.user.organizationId, body.notes, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a test procedure' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.testProceduresService.delete(id, req.user.organizationId);
  }
}

