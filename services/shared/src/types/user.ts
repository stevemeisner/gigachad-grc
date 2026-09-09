import { BaseEntity, Status } from './common';

export type UserRole = 'admin' | 'compliance_manager' | 'auditor' | 'viewer';

export interface User extends BaseEntity {
  /** Stable subject id from the identity provider (Firebase `sub`). */
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  organizationId: string;
  role: UserRole;
  status: Status;
  lastLoginAt?: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  dashboardLayout?: DashboardLayoutConfig;
  emailDigest: 'daily' | 'weekly' | 'never';
  notifications: {
    taskAssignments: boolean;
    evidenceReminders: boolean;
    complianceAlerts: boolean;
    policyReviews: boolean;
  };
}

export interface DashboardLayoutConfig {
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  config?: Record<string, unknown>;
}

export interface UserContext {
  userId: string;
  /** Firebase `sub` for the signed-in account. Identity only -- never authorization. */
  externalId: string;
  email: string;
  organizationId: string;
  role: UserRole;
  permissions: string[];
  // Optional display name used in some controllers (e.g., BCDR audit logging)
  displayName?: string;
  name?: string;
}

export interface CreateUserDto {
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  role: UserRole;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  status?: Status;
  preferences?: Partial<UserPreferences>;
}

