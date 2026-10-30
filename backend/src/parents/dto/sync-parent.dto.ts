import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SyncParentDto {
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}
