import { IsString, IsOptional, IsArray, IsEnum, IsEmail } from 'class-validator';

export class CreateUserDto {
  /**
   * The person's Firebase subject id. Optional, because it does not exist
   * until they have signed in at least once. Supply it only when the account
   * is already in Firebase and the id is at hand; otherwise the row is created
   * with a placeholder and claimed on first Google sign-in.
   */
  @IsOptional()
  @IsString()
  externalId?: string;

  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

/** Upsert payload for a user identified by their identity-provider subject. */
export class SyncUserFromProviderDto {
  @IsString()
  externalId: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

export class UserFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  groupId?: string;
}

export class UserResponseDto {
  id: string;
  /**
   * The Firebase subject id, omitted while the account still carries its
   * pre-provisioning placeholder — a placeholder is not an identifier and
   * must not be presented as one.
   */
  externalId?: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: string;
  status: string;
  lastLoginAt?: Date;
  /**
   * False until the account has been claimed by a real Google sign-in. An
   * account created by an administrator starts out false.
   */
  hasSignedIn: boolean;
  groups: { id: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}

export class UserListResponseDto {
  users: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
}



