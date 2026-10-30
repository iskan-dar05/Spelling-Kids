import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SpeechService } from './speech.service.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CreateSpeechDto } from './dto/create-speech.dto.js';

@Controller('speech')
@UseGuards(ClerkAuthGuard)
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Get('audio/:cacheKey')
  @Header('Content-Type', 'audio/wav')
  async cachedAudio(
    @Param('cacheKey') cacheKey: string,
  ): Promise<StreamableFile> {
    const audio = await this.speechService.cachedAudio(cacheKey);
    return new StreamableFile(audio, {
      type: 'audio/wav',
      disposition: 'inline',
    });
  }

  @Post('tts')
  @Header('Content-Type', 'audio/wav')
  async textToSpeech(@Body() dto: CreateSpeechDto): Promise<StreamableFile> {
    console.log('I work');
    const result = await this.speechService.textToSpeech(
      dto.text.trim(),
      dto.language ?? 'en',
    );

    return new StreamableFile(result.audio, {
      type: result.contentType,
      disposition: 'inline; filename="speech.wav"',
    });
  }

  @Post('stt')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async speechToText(
    @UploadedFile() file: Express.Multer.File,
    @Body('language') language = 'en',
  ) {
    if (!file) {
      throw new BadRequestException('An audio file is required');
    }

    const allowedTypes = new Set([
      'audio/wav',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/m4a',
      'audio/webm',
      'audio/ogg',
      'application/octet-stream',
    ]);
    if (!allowedTypes.has(file.mimetype)) {
      throw new BadRequestException('Unsupported audio content type');
    }
    if (!['en', 'fr', 'ar'].includes(language)) {
      throw new BadRequestException('Supported language codes: en, fr, ar');
    }

    return this.speechService.speechToText(file, language);
  }
}
