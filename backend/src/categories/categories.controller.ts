import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { CategoriesService } from './categories.service.js';

@Controller('categories')
@UseGuards(ClerkAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('childId') childId: string,
  ) {
    return this.categories.list(user.userId, childId);
  }

  @Get(':categoryId/progress')
  progress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Query('childId') childId: string,
  ) {
    return this.categories.get(user.userId, categoryId, childId);
  }

  @Get(':categoryId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Query('childId') childId: string,
  ) {
    return this.categories.get(user.userId, categoryId, childId);
  }
}