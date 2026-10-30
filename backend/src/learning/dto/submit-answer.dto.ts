import { IsInt, IsString, MaxLength, Min, MinLength, IsOptional } from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  answer!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(220)
  idempotencyKey!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;
}