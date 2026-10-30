import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { CreateChildDto } from './dto/create-child.dto.js';
import { UpdateChildDto } from './dto/update-child.dto.js';
import { ChildrenService } from './children.service.js';

@Controller('parents/me/children')
@UseGuards(ClerkAuthGuard)
export class ChildrenController {
  constructor(private readonly children: ChildrenService) {}

 @Get()
list(@CurrentUser() user: AuthenticatedUser) {
  return this.children.list(user.userId);
}

  @Post()
create(
  @CurrentUser() user: AuthenticatedUser,
  @Body() dto: CreateChildDto,
) {
  return this.children.create(user.userId, dto);
}

  @Patch(':childId')
  update(@CurrentUser() user: AuthenticatedUser, @Param('childId') childId: string, @Body() dto: UpdateChildDto) {
    return this.children.update(user.userId, childId, dto);
  }

  @Delete(':childId')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('childId') childId: string) {
    return this.children.archive(user.userId, childId);
  }
}
