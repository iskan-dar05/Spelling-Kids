import { PartialType } from '@nestjs/mapped-types';
import { CreateSpeechDto } from './create-speech.dto.js';

export class UpdateSpeechDto extends PartialType(CreateSpeechDto) {}
