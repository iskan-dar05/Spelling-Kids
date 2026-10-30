import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChildStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateChildDto } from './dto/create-child.dto.js';
import { UpdateChildDto } from './dto/update-child.dto.js';

const childSelect = { id: true, parentId: true, displayName: true, avatarKey: true, ageGroup: true, status: true, lastActiveAt: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class ChildrenService {
  constructor(private readonly prisma: PrismaService) {}

  private async parentIdFor(clerkId: string): Promise<string> {
    const parent = await this.prisma.parent.upsert({ where: { clerkId }, create: { clerkId }, update: {}, select: { id: true } });
    return parent.id;
  }

 async list(clerkId: string) {
  const parentId = await this.parentIdFor(clerkId);

  const children = await this.prisma.childProfile.findMany({
    where: { parentId },
    orderBy: { createdAt: 'asc' },
    select: childSelect,
  });

  return children;
}

  async create(clerkId: string, dto: CreateChildDto) {
    const parentId = await this.parentIdFor(clerkId);
    return this.prisma.childProfile.create({
      data: { parentId, displayName: dto.displayName.trim(), avatarKey: dto.avatarKey, ageGroup: dto.ageGroup },
      select: childSelect,
    });
  }

  async update(clerkId: string, childId: string, dto: UpdateChildDto) {
    const parentId = await this.parentIdFor(clerkId);
    const owned = await this.prisma.childProfile.findFirst({ where: { id: childId, parentId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Child profile not found');
    return this.prisma.childProfile.update({
      where: { id: childId },
      data: { ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}), ...(dto.avatarKey !== undefined ? { avatarKey: dto.avatarKey } : {}), ...(dto.ageGroup !== undefined ? { ageGroup: dto.ageGroup } : {}), ...(dto.status !== undefined ? { status: dto.status as ChildStatus } : {}) },
      select: childSelect,
    });
  }

  async archive(clerkId: string, childId: string) {
    const parentId = await this.parentIdFor(clerkId);
    const owned = await this.prisma.childProfile.findFirst({ where: { id: childId, parentId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Child profile not found');
    // Archive instead of hard-delete so learning history can be retained.
    return this.prisma.childProfile.update({ where: { id: childId }, data: { status: ChildStatus.ARCHIVED }, select: childSelect });
  }
}
