import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { TrustCenterModule } from './trust-center/trust-center.module';
import { TrustConfigModule } from './config/trust-config.module';
import { TemplatesModule } from './templates/templates.module';
import { TrustAiModule } from './ai/trust-ai.module';
import { PrismaService } from './common/prisma.service';
import { AuditService } from './common/audit.service';
import { HealthModule } from '@gigachad-grc/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    QuestionnairesModule,
    KnowledgeBaseModule,
    TrustCenterModule,
    TrustConfigModule,
    TemplatesModule,
    TrustAiModule,
  ],
  providers: [PrismaService, AuditService],
  exports: [PrismaService, AuditService],
})
export class AppModule {}
