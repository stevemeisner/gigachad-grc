import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Put,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard, UserId } from '@gigachad-grc/shared';
import { NotificationsService } from './notifications.service';
import {
  NotificationFilterDto,
  MarkReadDto,
  UpdatePreferencesDto,
  NotificationStatsDto,
  NotificationPreferenceResponseDto,
} from './dto/notification.dto';

@Controller('api/notifications')
@UseGuards(FirebaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ===========================
  // Get Notifications
  // ===========================

  @Get()
  async findAll(
    @UserId() userId: string,
    @Query() filters: NotificationFilterDto,
  ) {
    return this.notificationsService.findAll(userId, filters);
  }

  @Get('unread-count')
  async getUnreadCount(
    @UserId() userId: string,
  ): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Get('stats')
  async getStats(
    @UserId() userId: string,
  ): Promise<NotificationStatsDto> {
    return this.notificationsService.getStats(userId);
  }

  @Get(':id')
  async findOne(
    @UserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.findOne(userId, id);
  }

  // ===========================
  // Mark as Read
  // ===========================

  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @UserId() userId: string,
    @Body() dto: MarkReadDto,
  ): Promise<{ updated: number }> {
    return this.notificationsService.markAsRead(userId, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markOneAsRead(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.notificationsService.markOneAsRead(userId, id);
    return { success: true };
  }

  // ===========================
  // Delete Notifications
  // ===========================

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notificationsService.delete(userId, id);
  }

  @Delete()
  async deleteAll(
    @UserId() userId: string,
  ): Promise<{ deleted: number }> {
    return this.notificationsService.deleteAll(userId);
  }

  // ===========================
  // Preferences
  // ===========================

  @Get('preferences/list')
  async getPreferences(
    @UserId() userId: string,
  ): Promise<NotificationPreferenceResponseDto[]> {
    return this.notificationsService.getPreferences(userId);
  }

  @Put('preferences')
  async updatePreferences(
    @UserId() userId: string,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<{ success: boolean }> {
    await this.notificationsService.updatePreferences(userId, dto.preferences);
    return { success: true };
  }
}

