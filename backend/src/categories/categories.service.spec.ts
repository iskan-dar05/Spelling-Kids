import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('CategoriesService', () => {
  const childProfile = { findFirst: vi.fn() };
  const category = { findMany: vi.fn(), findUnique: vi.fn() };
  const prisma = { childProfile, category } as unknown as PrismaService;
  const service = new CategoriesService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a child not owned by the authenticated parent', async () => {
    childProfile.findFirst.mockResolvedValue(null);

    await expect(service.list('parent-1', 'child-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(category.findMany).not.toHaveBeenCalled();
  });

  it('returns child progress for published words only', async () => {
    childProfile.findFirst.mockResolvedValue({ id: 'child-1' });
    category.findMany.mockResolvedValue([{
      id: 'category-1', name: 'Fruit', description: null, difficulty: 1,
      words: [
        { id: 'word-1', exercises: [{ id: 'exercise-1' }], progress: [{ attempts: 4, correctCount: 3, masteryLevel: 3, reviewAt: new Date('2099-01-01') }] },
        { id: 'word-unpublished', exercises: [], progress: [{ attempts: 8, correctCount: 8, masteryLevel: 3, reviewAt: new Date('2000-01-01') }] },
      ],
    }]);

    await expect(service.list('parent-1', 'child-1')).resolves.toEqual([{
      id: 'category-1', name: 'Fruit', description: null, difficulty: 1,
      wordCount: 1, publishedExerciseCount: 1, attemptedWords: 1, completedWords: 1,
      progressPercent: 100, accuracyPercent: 75, attempts: 4, masteryLevel: 3, dueForReview: 0,
    }]);
  });
});