import { Controller, Get } from '@nestjs/common';
import { PrismaHealthIndicator } from './prisma.health';

interface HealthCheckResponse {
  status: 'ok' | 'error';
  info?: Record<string, any>;
  error?: Record<string, any>;
  details?: Record<string, any>;
}

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaHealthIndicator) {}

  /**
   * Get memory usage stats
   */
  private getMemoryStats() {
    const used = process.memoryUsage();
    return {
      heapUsed: used.heapUsed,
      heapTotal: used.heapTotal,
      rss: used.rss,
      external: used.external,
    };
  }

  /**
   * Check if memory is within limits
   */
  private checkMemory(heapLimit: number, rssLimit: number) {
    const memory = this.getMemoryStats();
    const heapOk = memory.heapUsed < heapLimit;
    const rssOk = memory.rss < rssLimit;

    return {
      memory_heap: {
        status: heapOk ? 'up' : 'down',
        used: memory.heapUsed,
        limit: heapLimit,
      },
      memory_rss: {
        status: rssOk ? 'up' : 'down',
        used: memory.rss,
        limit: rssLimit,
      },
    };
  }

  /**
   * Liveness probe - indicates the service is running
   * Used by container orchestrators to restart unhealthy containers
   */
  @Get('live')
  async checkLive(): Promise<HealthCheckResponse> {
    const memoryCheck = this.checkMemory(
      500 * 1024 * 1024, // 500MB heap
      1024 * 1024 * 1024 // 1GB RSS
    );

    const isHealthy = memoryCheck.memory_heap.status === 'up';

    return {
      status: isHealthy ? 'ok' : 'error',
      info: isHealthy ? { memory_heap: memoryCheck.memory_heap } : undefined,
      error: !isHealthy ? { memory_heap: memoryCheck.memory_heap } : undefined,
      details: memoryCheck,
    };
  }

  /**
   * Readiness probe - indicates the service is ready to accept traffic
   * Checks database connectivity and other dependencies
   */
  @Get('ready')
  async checkReady(): Promise<HealthCheckResponse> {
    const dbCheck = await this.prisma.isHealthy('database');
    const memoryCheck = this.checkMemory(
      500 * 1024 * 1024, // 500MB heap
      1024 * 1024 * 1024 // 1GB RSS
    );

    const dbHealthy = dbCheck.database?.status === 'up';
    const memoryHealthy = memoryCheck.memory_heap.status === 'up' && 
                          memoryCheck.memory_rss.status === 'up';
    const isHealthy = dbHealthy && memoryHealthy;

    const info: Record<string, any> = {};
    const error: Record<string, any> = {};

    if (dbHealthy) {
      info.database = dbCheck.database;
    } else {
      error.database = dbCheck.database;
    }

    if (memoryCheck.memory_heap.status === 'up') {
      info.memory_heap = memoryCheck.memory_heap;
    } else {
      error.memory_heap = memoryCheck.memory_heap;
    }

    if (memoryCheck.memory_rss.status === 'up') {
      info.memory_rss = memoryCheck.memory_rss;
    } else {
      error.memory_rss = memoryCheck.memory_rss;
    }

    return {
      status: isHealthy ? 'ok' : 'error',
      info: Object.keys(info).length > 0 ? info : undefined,
      error: Object.keys(error).length > 0 ? error : undefined,
      details: { ...dbCheck, ...memoryCheck },
    };
  }

  /**
   * Full health check - comprehensive status including all dependencies
   */
  @Get()
  async check(): Promise<HealthCheckResponse> {
    return this.checkReady();
  }
}
