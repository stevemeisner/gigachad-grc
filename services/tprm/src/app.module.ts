import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VendorsModule } from './vendors/vendors.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { ContractsModule } from './contracts/contracts.module';
import { VendorAIModule } from './ai/vendor-ai.module';
import { TprmConfigModule } from './config/tprm-config.module';
import { PrismaService } from './common/prisma.service';
import { AuditService } from './common/audit.service';
import { StorageModule, HealthModule } from '@gigachad-grc/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    StorageModule.forRoot(),
    VendorsModule,
    AssessmentsModule,
    ContractsModule,
    VendorAIModule,
    TprmConfigModule,
  ],
  providers: [PrismaService, AuditService],
  exports: [PrismaService, AuditService],
})
export class AppModule {}
