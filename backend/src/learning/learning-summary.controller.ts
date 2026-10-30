import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { LearningService } from './learning.service.js';

@Controller('learning/children')
@UseGuards(ClerkAuthGuard)
export class LearningSummaryController {
  constructor(private readonly learning: LearningService) {}

  @Get(':childId/summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Param('childId') childId: string) {
    return this.learning.childSummary(user.userId, childId);
  }
}