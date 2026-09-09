import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { FrameworksModule } from './frameworks/frameworks.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { MappingsModule } from './mappings/mappings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    FrameworksModule,
    AssessmentsModule,
    MappingsModule,
  ],
})
export class AppModule {}



