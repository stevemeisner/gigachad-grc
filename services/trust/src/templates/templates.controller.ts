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
import { TemplatesService, CreateTemplateDto, UpdateTemplateDto } from './templates.service';
import { CurrentUser, FirebaseAuthGuard, UserContext } from '@gigachad-grc/shared';

@Controller('answer-templates')
@UseGuards(FirebaseAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.templatesService.create(dto, user.userId);
  }

  @Get()
  findAll(
    @Query('organizationId') organizationId: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.templatesService.findAll(organizationId, {
      category,
      status,
      search,
    });
  }

  @Get('stats')
  getStats(@Query('organizationId') organizationId: string) {
    return this.templatesService.getStats(organizationId);
  }

  @Get('categories')
  getCategories(@Query('organizationId') organizationId: string) {
    return this.templatesService.getCategories(organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.templatesService.update(id, dto, user.userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.templatesService.remove(id, user.userId);
  }

  @Post(':id/archive')
  archive(
    @Param('id') id: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.templatesService.archive(id, user.userId);
  }

  @Post(':id/unarchive')
  unarchive(
    @Param('id') id: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.templatesService.unarchive(id, user.userId);
  }

  @Post(':id/apply')
  applyTemplate(
    @Param('id') id: string,
    @Body() body: { variables: Record<string, string> },
  ) {
    return this.templatesService.applyTemplate(id, body.variables || {});
  }

  @Post(':id/use')
  incrementUsage(@Param('id') id: string) {
    return this.templatesService.incrementUsage(id);
  }
}

