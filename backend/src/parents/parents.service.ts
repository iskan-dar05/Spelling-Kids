import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncParentDto } from './dto/sync-parent.dto.js';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  getOrCreate(clerkId: string) {
    return this.prisma.parent.upsert({
      where: { clerkId },
      create: { clerkId },
      update: {},
      select: { id: true, clerkId: true, email: true, name: true, createdAt: true, updatedAt: true },
    });
  }

  update(clerkId: string, dto: SyncParentDto) {
    return this.prisma.parent.upsert({
      where: { clerkId },
      create: { clerkId, email: dto.email, name: dto.name },
      update: { ...(dto.email !== undefined ? { email: dto.email } : {}), ...(dto.name !== undefined ? { name: dto.name } : {}) },
      select: { id: true, clerkId: true, email: true, name: true, createdAt: true, updatedAt: true },
    });
  }
}
