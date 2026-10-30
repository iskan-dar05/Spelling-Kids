import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSpeechDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text!: string;

  @IsOptional()
  @IsString()
  @IsIn(['en', 'fr', 'ar'])
  language?: string;
}
