
import { Module } from '@nestjs/common';
import { SpeechController } from './speech.controller.js';
import { SpeechService } from './speech.service.js';

@Module({
  controllers: [SpeechController],
  providers: [SpeechService],
  exports: [SpeechService],
})
export class SpeechModule {}
