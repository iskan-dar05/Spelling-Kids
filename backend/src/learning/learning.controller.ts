import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { StartSessionDto } from './dto/start-session.dto.js';
import { SubmitAnswerDto } from './dto/submit-answer.dto.js';
import { LearningService } from './learning.service.js';

@Controller('learning/sessions')
@UseGuards(ClerkAuthGuard)
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartSessionDto) {
    return this.learning.startOrResume(user.userId, dto);
  }

  @Get(':sessionId/current')
  current(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.learning.current(user.userId, sessionId);
  }

  @Post(':sessionId/answer')
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.learning.submit(user.userId, sessionId, dto);
  }

  @Post(':sessionId/next')
  next(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.learning.next(user.userId, sessionId);
  }

  @Post(':sessionId/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.learning.complete(user.userId, sessionId);
  }

  @Post(':sessionId/abandon')
  abandon(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.learning.abandon(user.userId, sessionId);
  }

  @Get(':sessionId/current/audio')
  audio(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    
    return this.learning.audio(user.userId, sessionId);
  }

  @Get(':sessionId/summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.learning.summary(user.userId, sessionId);
  }
}