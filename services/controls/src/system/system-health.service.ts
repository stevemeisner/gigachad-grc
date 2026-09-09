import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  HealthStatus,
  CheckCategory,
  HealthCheckResult,
  SystemHealthResponse,
  BackupStatusResponse,
  SetupStatusResponse,
  ProductionReadinessResponse,
} from './dto/system-health.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);
  private readonly appVersion = process.env.npm_package_version || '1.0.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Run all system health checks and return comprehensive status
   */
  async getSystemHealth(): Promise<SystemHealthResponse> {
    const checks: HealthCheckResult[] = [];

    // Run all checks in parallel for performance
    const [
      securityChecks,
      backupChecks,
      databaseChecks,
      storageChecks,
      authChecks,
      configChecks,
    ] = await Promise.all([
      this.runSecurityChecks(),
      this.runBackupChecks(),
      this.runDatabaseChecks(),
      this.runStorageChecks(),
      this.runAuthenticationChecks(),
      this.runConfigurationChecks(),
    ]);

    checks.push(
      ...securityChecks,
      ...backupChecks,
      ...databaseChecks,
      ...storageChecks,
      ...authChecks,
      ...configChecks,
    );

    const summary = {
      total: checks.length,
      healthy: checks.filter((c) => c.status === HealthStatus.HEALTHY).length,
      warnings: checks.filter((c) => c.status === HealthStatus.WARNING).length,
      critical: checks.filter((c) => c.status === HealthStatus.CRITICAL).length,
    };

    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;
    if (summary.critical > 0) {
      overallStatus = HealthStatus.CRITICAL;
    } else if (summary.warnings > 0) {
      overallStatus = HealthStatus.WARNING;
    }

    return {
      overallStatus,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: this.appVersion,
      checks,
      summary,
    };
  }

  /**
   * Security-related checks
   */
  private async runSecurityChecks(): Promise<HealthCheckResult[]> {
    const checks: HealthCheckResult[] = [];

    // Check if running in production with the demo auth bypass.
    // This previously keyed off KEYCLOAK_URL/USE_DEV_AUTH; with Keycloak gone
    // those are always unset, which would have made isDevAuth permanently
    // true and the check meaningless. AUTH_MODE is now the only bypass.
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isDevAuth = process.env.AUTH_MODE === 'demo';

    checks.push({
      id: 'security-auth-mode',
      name: 'Authentication Mode',
      category: CheckCategory.SECURITY,
      status:
        nodeEnv === 'production' && isDevAuth
          ? HealthStatus.CRITICAL
          : isDevAuth
            ? HealthStatus.WARNING
            : HealthStatus.HEALTHY,
      message:
        nodeEnv === 'production' && isDevAuth
          ? 'CRITICAL: Using development authentication in production!'
          : isDevAuth
            ? 'Using development authentication (acceptable for dev/test)'
            : 'Using Firebase authentication',
      recommendation: isDevAuth
        ? 'Set AUTH_MODE to something other than demo and configure FIREBASE_PROJECT_ID'
        : undefined,
      documentationUrl: '/docs/help/admin/organization.md',
    });

    // Check for default passwords
    const postgresPassword = process.env.POSTGRES_PASSWORD || '';
    const redisPassword = process.env.REDIS_PASSWORD || '';
    const minioPassword = process.env.MINIO_ROOT_PASSWORD || '';

    const defaultPasswords = ['password', 'grc_secret', 'redis_secret', 'minioadmin', 'admin', ''];
    const hasDefaultPassword =
      defaultPasswords.includes(postgresPassword) ||
      defaultPasswords.includes(redisPassword) ||
      defaultPasswords.includes(minioPassword);

    checks.push({
      id: 'security-default-passwords',
      name: 'Default Passwords',
      category: CheckCategory.SECURITY,
      status:
        nodeEnv === 'production' && hasDefaultPassword
          ? HealthStatus.CRITICAL
          : hasDefaultPassword
            ? HealthStatus.WARNING
            : HealthStatus.HEALTHY,
      message: hasDefaultPassword
        ? 'One or more services are using default passwords'
        : 'All passwords have been changed from defaults',
      recommendation: hasDefaultPassword
        ? 'Generate strong, unique passwords for all services'
        : undefined,
      documentationUrl: '/deploy/README.md#step-3-configure-environment',
    });

    // Check encryption key
    const encryptionKey = process.env.ENCRYPTION_KEY || '';
    checks.push({
      id: 'security-encryption-key',
      name: 'Encryption Key',
      category: CheckCategory.SECURITY,
      status:
        !encryptionKey || encryptionKey.length < 32
          ? nodeEnv === 'production'
            ? HealthStatus.CRITICAL
            : HealthStatus.WARNING
          : HealthStatus.HEALTHY,
      message:
        !encryptionKey || encryptionKey.length < 32
          ? 'Encryption key is missing or too short'
          : 'Encryption key is properly configured',
      recommendation:
        !encryptionKey || encryptionKey.length < 32
          ? 'Generate a 32+ character encryption key using: openssl rand -hex 32'
          : undefined,
    });

    // Check JWT secret
    const jwtSecret = process.env.JWT_SECRET || '';
    checks.push({
      id: 'security-jwt-secret',
      name: 'JWT Secret',
      category: CheckCategory.SECURITY,
      status:
        !jwtSecret || jwtSecret.length < 32
          ? nodeEnv === 'production'
            ? HealthStatus.CRITICAL
            : HealthStatus.WARNING
          : HealthStatus.HEALTHY,
      message:
        !jwtSecret || jwtSecret.length < 32
          ? 'JWT secret is missing or too short'
          : 'JWT secret is properly configured',
      recommendation:
        !jwtSecret || jwtSecret.length < 32
          ? 'Generate a strong JWT secret using: openssl rand -base64 64'
          : undefined,
    });

    return checks;
  }

  /**
   * Backup-related checks
   */
  private async runBackupChecks(): Promise<HealthCheckResult[]> {
    const checks: HealthCheckResult[] = [];
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Check if backup script exists - try multiple possible locations
    const possibleBackupPaths = [
      path.join(process.cwd(), 'deploy', 'backup.sh'),
      path.join(process.cwd(), '..', 'deploy', 'backup.sh'),
      path.join(process.cwd(), '..', '..', 'deploy', 'backup.sh'),
      '/app/deploy/backup.sh', // Docker container path
      '/opt/gigachad-grc/deploy/backup.sh', // Production path
    ];
    
    let backupScriptPath = '';
    let backupExists = false;
    for (const p of possibleBackupPaths) {
      if (fs.existsSync(p)) {
        backupScriptPath = p;
        backupExists = true;
        break;
      }
    }

    checks.push({
      id: 'backup-script-exists',
      name: 'Backup Script',
      category: CheckCategory.BACKUP,
      status: backupExists ? HealthStatus.HEALTHY : HealthStatus.WARNING,
      message: backupExists
        ? 'Backup script is available'
        : 'Backup script not found at expected location',
      recommendation: !backupExists
        ? 'Ensure deploy/backup.sh exists and is executable'
        : undefined,
    });

    // Check remote backup configuration
    const remoteBackupEnabled = process.env.DR_REMOTE_BACKUP_ENABLED === 'true';
    const remoteBackupBucket = process.env.DR_REMOTE_BACKUP_S3_BUCKET;

    checks.push({
      id: 'backup-remote-config',
      name: 'Remote Backup',
      category: CheckCategory.BACKUP,
      status:
        nodeEnv === 'production' && !remoteBackupEnabled
          ? HealthStatus.WARNING
          : remoteBackupEnabled && remoteBackupBucket
            ? HealthStatus.HEALTHY
            : HealthStatus.WARNING,
      message: remoteBackupEnabled
        ? `Remote backup configured to ${remoteBackupBucket}`
        : 'Remote backup is not configured',
      recommendation: !remoteBackupEnabled
        ? 'Configure remote backup to S3 for disaster recovery'
        : undefined,
      documentationUrl: '/deploy/README.md#backup-to-remote-storage',
    });

    // Check backup retention
    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
    checks.push({
      id: 'backup-retention',
      name: 'Backup Retention',
      category: CheckCategory.BACKUP,
      status:
        retentionDays >= 30
          ? HealthStatus.HEALTHY
          : retentionDays >= 7
            ? HealthStatus.WARNING
            : HealthStatus.CRITICAL,
      message: `Backup retention set to ${retentionDays} days`,
      details: { retentionDays },
      recommendation:
        retentionDays < 30
          ? 'Increase backup retention to at least 30 days for compliance'
          : undefined,
    });

    return checks;
  }

  /**
   * Database-related checks
   */
  private async runDatabaseChecks(): Promise<HealthCheckResult[]> {
    const checks: HealthCheckResult[] = [];

    // Check database connectivity
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({
        id: 'database-connectivity',
        name: 'Database Connectivity',
        category: CheckCategory.DATABASE,
        status: HealthStatus.HEALTHY,
        message: 'Database connection is healthy',
      });
    } catch (error) {
      checks.push({
        id: 'database-connectivity',
        name: 'Database Connectivity',
        category: CheckCategory.DATABASE,
        status: HealthStatus.CRITICAL,
        message: 'Database connection failed',
        details: { error: (error as Error).message },
        recommendation: 'Check DATABASE_URL and PostgreSQL service status',
      });
    }

    // Check database SSL
    const databaseUrl = process.env.DATABASE_URL || '';
    const usesSsl = databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true');
    const nodeEnv = process.env.NODE_ENV || 'development';

    checks.push({
      id: 'database-ssl',
      name: 'Database SSL',
      category: CheckCategory.DATABASE,
      status:
        nodeEnv === 'production' && !usesSsl
          ? HealthStatus.WARNING
          : usesSsl
            ? HealthStatus.HEALTHY
            : HealthStatus.WARNING,
      message: usesSsl
        ? 'Database connections are encrypted with SSL'
        : 'Database connections are not using SSL',
      recommendation: !usesSsl
        ? 'Enable SSL for database connections in production'
        : undefined,
    });

    // Connection pool is managed by Prisma - just verify the service is working
    checks.push({
      id: 'database-pool',
      name: 'Connection Pool',
      category: CheckCategory.DATABASE,
      status: HealthStatus.HEALTHY,
      message: 'Database connection pool is managed by Prisma',
      details: {
        connectionLimit: process.env.DATABASE_CONNECTION_LIMIT || '10',
        poolTimeout: process.env.DATABASE_POOL_TIMEOUT || '10',
      },
    });

    return checks;
  }

  /**
   * Storage-related checks
   */
  private async runStorageChecks(): Promise<HealthCheckResult[]> {
    const checks: HealthCheckResult[] = [];

    // Check MinIO configuration
    const minioEndpoint = process.env.MINIO_ENDPOINT;
    const minioAccessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER;

    checks.push({
      id: 'storage-minio-config',
      name: 'Object Storage Configuration',
      category: CheckCategory.STORAGE,
      status:
        minioEndpoint && minioAccessKey ? HealthStatus.HEALTHY : HealthStatus.WARNING,
      message:
        minioEndpoint && minioAccessKey
          ? `Object storage configured at ${minioEndpoint}`
          : 'Object storage not fully configured',
      recommendation:
        !minioEndpoint || !minioAccessKey
          ? 'Configure MinIO or S3 for evidence file storage'
          : undefined,
    });

    // Check storage SSL
    const minioUseSsl = process.env.MINIO_USE_SSL === 'true';
    const nodeEnv = process.env.NODE_ENV || 'development';

    checks.push({
      id: 'storage-ssl',
      name: 'Object Storage SSL',
      category: CheckCategory.STORAGE,
      status:
        nodeEnv === 'production' && !minioUseSsl
          ? HealthStatus.WARNING
          : minioUseSsl
            ? HealthStatus.HEALTHY
            : HealthStatus.WARNING,
      message: minioUseSsl
        ? 'Object storage connections are encrypted'
        : 'Object storage connections are not using SSL',
      recommendation:
        !minioUseSsl && nodeEnv === 'production'
          ? 'Enable SSL for object storage connections'
          : undefined,
    });

    return checks;
  }

  /**
   * Authentication-related checks
   */
  private async runAuthenticationChecks(): Promise<HealthCheckResult[]> {
    const checks: HealthCheckResult[] = [];

    // Check Firebase authentication configuration
    const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
    const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;
    const demoMode = process.env.AUTH_MODE === 'demo';
    const nodeEnv = process.env.NODE_ENV || 'development';
    const authConfigured = demoMode || !!firebaseProjectId;

    checks.push({
      id: 'auth-firebase-config',
      name: 'Firebase Configuration',
      category: CheckCategory.AUTHENTICATION,
      status: authConfigured
        ? HealthStatus.HEALTHY
        : nodeEnv === 'production'
          ? HealthStatus.CRITICAL
          : HealthStatus.WARNING,
      message: demoMode
        ? 'AUTH_MODE=demo: tokens are not verified (development only)'
        : firebaseProjectId
          ? `Firebase project ${firebaseProjectId}`
          : 'FIREBASE_PROJECT_ID is not set',
      recommendation: !authConfigured
        ? 'Set FIREBASE_PROJECT_ID to the Firebase project that issues your ID tokens'
        : undefined,
      documentationUrl: '/docs/DEPLOYMENT-RUNBOOK.md',
    });

    // Without an allowlist any verified Google account can reach the API; the
    // provisioned-users requirement is then the only remaining gate.
    checks.push({
      id: 'auth-domain-allowlist',
      name: 'Email Domain Allowlist',
      category: CheckCategory.AUTHENTICATION,
      status: allowedDomains
        ? HealthStatus.HEALTHY
        : nodeEnv === 'production'
          ? HealthStatus.WARNING
          : HealthStatus.HEALTHY,
      message: allowedDomains
        ? `Sign-in restricted to: ${allowedDomains}`
        : 'No email domain restriction configured',
      recommendation: !allowedDomains
        ? 'Set ALLOWED_EMAIL_DOMAINS to your company domain'
        : undefined,
      documentationUrl: '/docs/DEPLOYMENT-RUNBOOK.md',
    });

    // Check session configuration
    const sessionSecret = process.env.SESSION_SECRET || '';
    checks.push({
      id: 'auth-session-secret',
      name: 'Session Secret',
      category: CheckCategory.AUTHENTICATION,
      status:
        sessionSecret.length >= 32
          ? HealthStatus.HEALTHY
          : nodeEnv === 'production'
            ? HealthStatus.CRITICAL
            : HealthStatus.WARNING,
      message:
        sessionSecret.length >= 32
          ? 'Session secret is properly configured'
          : 'Session secret is missing or too short',
      recommendation:
        sessionSecret.length < 32
          ? 'Generate a strong session secret: openssl rand -base64 64'
          : undefined,
    });

    return checks;
  }

  /**
   * Configuration-related checks
   */
  private async runConfigurationChecks(): Promise<HealthCheckResult[]> {
    const checks: HealthCheckResult[] = [];
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Check NODE_ENV
    checks.push({
      id: 'config-node-env',
      name: 'Environment Mode',
      category: CheckCategory.CONFIGURATION,
      status: HealthStatus.HEALTHY,
      message: `Running in ${nodeEnv} mode`,
      details: { nodeEnv },
    });

    // Check CORS configuration
    const corsOrigins = process.env.CORS_ORIGINS || '';
    const hasWildcard = corsOrigins === '*';

    checks.push({
      id: 'config-cors',
      name: 'CORS Configuration',
      category: CheckCategory.CONFIGURATION,
      status:
        nodeEnv === 'production' && hasWildcard
          ? HealthStatus.WARNING
          : HealthStatus.HEALTHY,
      message: hasWildcard
        ? 'CORS allows all origins (wildcard)'
        : corsOrigins
          ? `CORS restricted to: ${corsOrigins}`
          : 'CORS using default configuration',
      recommendation:
        hasWildcard && nodeEnv === 'production'
          ? 'Restrict CORS to specific origins in production'
          : undefined,
    });

    // Check rate limiting
    const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
    checks.push({
      id: 'config-rate-limit',
      name: 'Rate Limiting',
      category: CheckCategory.CONFIGURATION,
      status:
        rateLimitEnabled
          ? HealthStatus.HEALTHY
          : nodeEnv === 'production'
            ? HealthStatus.WARNING
            : HealthStatus.HEALTHY,
      message: rateLimitEnabled
        ? 'Rate limiting is enabled'
        : 'Rate limiting is disabled',
      recommendation:
        !rateLimitEnabled && nodeEnv === 'production'
          ? 'Enable rate limiting to prevent abuse'
          : undefined,
    });

    // Check logging configuration
    const logLevel = process.env.LOG_LEVEL || 'info';
    checks.push({
      id: 'config-logging',
      name: 'Logging Level',
      category: CheckCategory.CONFIGURATION,
      status:
        nodeEnv === 'production' && logLevel === 'debug'
          ? HealthStatus.WARNING
          : HealthStatus.HEALTHY,
      message: `Log level set to ${logLevel}`,
      recommendation:
        nodeEnv === 'production' && logLevel === 'debug'
          ? 'Use info or warn log level in production for performance'
          : undefined,
    });

    return checks;
  }

  /**
   * Get backup status
   */
  async getBackupStatus(): Promise<BackupStatusResponse> {
    const remoteEnabled = process.env.DR_REMOTE_BACKUP_ENABLED === 'true';
    const remoteBucket = process.env.DR_REMOTE_BACKUP_S3_BUCKET;
    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);

    // Try to read last backup from a status file (if implemented)
    let lastBackup: string | undefined;
    let lastBackupStatus: 'success' | 'failed' | 'unknown' = 'unknown';

    const backupStatusPath = '/backups/gigachad-grc/last-backup.json';
    if (fs.existsSync(backupStatusPath)) {
      try {
        const statusData = JSON.parse(fs.readFileSync(backupStatusPath, 'utf-8'));
        lastBackup = statusData.timestamp;
        lastBackupStatus = statusData.status || 'unknown';
      } catch {
        // Ignore parse errors
      }
    }

    return {
      configured: true, // Backup script exists
      lastBackup,
      lastBackupStatus,
      backupDestinations: {
        local: true,
        remote: remoteEnabled,
        remoteProvider: remoteEnabled ? 'AWS S3' : undefined,
      },
      retentionDays,
    };
  }

  /**
   * Get setup status for first-run wizard
   */
  async getSetupStatus(): Promise<SetupStatusResponse> {
    const completedSteps: string[] = [];
    const pendingSteps: string[] = [];

    // Check each setup step
    const steps = [
      {
        id: 'database',
        check: async () => {
          try {
            await this.prisma.$queryRaw`SELECT 1`;
            return true;
          } catch {
            return false;
          }
        },
      },
      {
        id: 'admin-user',
        check: async () => {
          const adminCount = await this.prisma.user.count({
            where: { role: 'admin' },
          });
          return adminCount > 0;
        },
      },
      {
        id: 'organization',
        check: async () => {
          const orgCount = await this.prisma.organization.count();
          return orgCount > 0;
        },
      },
      {
        id: 'encryption-key',
        check: async () => {
          const key = process.env.ENCRYPTION_KEY || '';
          return key.length >= 32;
        },
      },
      {
        id: 'authentication',
        check: async () => {
          // Demo mode counts as configured: the stack is deliberately running
          // without a real identity provider.
          return process.env.AUTH_MODE === 'demo' || !!process.env.FIREBASE_PROJECT_ID;
        },
      },
      {
        id: 'backup-config',
        check: async () => {
          const remoteEnabled = process.env.DR_REMOTE_BACKUP_ENABLED === 'true';
          return remoteEnabled;
        },
      },
    ];

    for (const step of steps) {
      try {
        const completed = await step.check();
        if (completed) {
          completedSteps.push(step.id);
        } else {
          pendingSteps.push(step.id);
        }
      } catch {
        pendingSteps.push(step.id);
      }
    }

    const isFirstRun = completedSteps.length < 3;
    const setupProgress = Math.round((completedSteps.length / steps.length) * 100);

    return {
      isFirstRun,
      completedSteps,
      pendingSteps,
      setupProgress,
    };
  }

  /**
   * Get production readiness score
   */
  async getProductionReadiness(): Promise<ProductionReadinessResponse> {
    const health = await this.getSystemHealth();
    const blockers: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    for (const check of health.checks) {
      if (check.status === HealthStatus.CRITICAL) {
        blockers.push(check.message);
        if (check.recommendation) {
          recommendations.push(check.recommendation);
        }
      } else if (check.status === HealthStatus.WARNING) {
        warnings.push(check.message);
        if (check.recommendation) {
          recommendations.push(check.recommendation);
        }
      }
    }

    // Calculate score
    const totalChecks = health.checks.length;
    const healthyChecks = health.summary.healthy;
    const warningChecks = health.summary.warnings;
    // Critical checks are weighted more heavily
    const score = Math.round(
      ((healthyChecks + warningChecks * 0.5) / totalChecks) * 100,
    );

    return {
      ready: blockers.length === 0,
      score,
      blockers,
      warnings,
      recommendations: [...new Set(recommendations)], // Deduplicate
    };
  }
}

