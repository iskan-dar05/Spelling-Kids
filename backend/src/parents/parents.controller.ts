import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { SyncParentDto } from './dto/sync-parent.dto.js';
import { ParentsService } from './parents.service.js';

@Controller('parents/me')
@UseGuards(ClerkAuthGuard)
export class ParentsController {
  constructor(private readonly parents: ParentsService) {}

  @Get()
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.parents.getOrCreate(user.userId);
  }

  @Put()
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncParentDto) {
    return this.parents.update(user.userId, dto);
  }
}
