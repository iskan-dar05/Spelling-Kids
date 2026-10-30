import { Module } from '@nestjs/common';
import { SpeechModule } from '../speech/speech.module.js';
import { LearningController } from './learning.controller.js';
import { LearningSummaryController } from './learning-summary.controller.js';
import { LearningService } from './learning.service.js';

@Module({
  imports: [SpeechModule],
  controllers: [LearningController, LearningSummaryController],
  providers: [LearningService],
})
export class LearningModule {}