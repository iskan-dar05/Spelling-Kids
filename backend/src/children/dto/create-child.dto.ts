import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChildDto {
  @IsString() 
  @MinLength(1)
  @MaxLength(60) 
  displayName!: string;


  @IsOptional() 
  @IsString() 
  @MaxLength(80) 
  avatarKey?: string;


  @IsOptional() 
  @IsIn(['4-5', '6-7', '8-9', '10-12'])
   ageGroup?: string;
}
