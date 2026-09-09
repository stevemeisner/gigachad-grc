import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ControlsModule } from './controls/controls.module';
import { EvidenceModule } from './evidence/evidence.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CommentsModule } from './comments/comments.module';
import { TasksModule } from './tasks/tasks.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { CollectorsModule } from './collectors/collectors.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationsConfigModule } from './notifications-config/notifications-config.module';
import { PermissionsModule } from './permissions/permissions.module';
import { UsersModule } from './users/users.module';
import { RiskModule } from './risk/risk.module';
import { EmailModule } from './email/email.module';
import { EmployeeComplianceModule } from './employee-compliance/employee-compliance.module';
import { SeedModule } from './seed/seed.module';
import { CustomDashboardsModule } from './custom-dashboards/custom-dashboards.module';
import { TrainingModule } from './training/training.module';
import { AIModule } from './ai/ai.module';
import { MCPModule } from './mcp/mcp.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { ReportsModule } from './reports/reports.module';
import { BCDRModule } from './bcdr/bcdr.module';
import { BulkOperationsModule } from './common/bulk-operations.module';
import { SystemModule } from './system/system.module';
import { ConfigAsCodeModule } from './config-as-code/config-as-code.module';
import { FrameworkCatalogModule } from './frameworks/catalog.module';
import { ModulesController } from './modules/modules.controller';
import { CustomThrottlerGuard } from './auth/throttler.guard';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { 
  StorageModule, 
  CacheModule,
  HealthModule,
} from '@gigachad-grc/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Rate limiting - multiple tiers for different use cases
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,    // 1 second
        limit: 5,     // 5 requests per second
      },
      {
        name: 'medium',
        ttl: 10000,   // 10 seconds
        limit: 30,    // 30 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000,   // 1 minute
        limit: 100,   // 100 requests per minute
      },
    ]),
    // Export Prometheus metrics at /metrics for monitoring and alerts
    PrometheusModule.register(),
    PrismaModule,
    StorageModule.forRoot(),
    CacheModule.forRoot({
      defaultTtl: 300, // 5 minutes
      maxSize: 1000,
      debug: process.env.NODE_ENV !== 'production',
    }),
    HealthModule,
    EmailModule,
    AuditModule,
    NotificationsModule,
    NotificationsConfigModule,
    PermissionsModule,
    UsersModule,
    ControlsModule,
    EvidenceModule,
    DashboardModule,
    CommentsModule,
    TasksModule,
    IntegrationsModule,
    CollectorsModule,
    RiskModule,
    EmployeeComplianceModule,
    SeedModule,
    CustomDashboardsModule,
    TrainingModule,
    AIModule,
    MCPModule,
    WorkspaceModule,
    ReportsModule,
    BCDRModule,
    BulkOperationsModule,
    SystemModule,
    ConfigAsCodeModule,
    FrameworkCatalogModule,
  ],
  controllers: [ModulesController],
  providers: [
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all API routes
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
