import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type CategoryProgressRecord = {
  id: string;
  name: string;
  description: string | null;
  difficulty: number;
  words: Array<{
    exercises: Array<{ id: string }>;
    progress: Array<{ attempts: number; correctCount: number; masteryLevel: number; reviewAt: Date | null }>;
  }>;
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertActiveChild(clerkId: string, childId: string) {
    if (!childId) throw new NotFoundException('Active child not found');

    const child = await this.prisma.childProfile.findFirst({
      where: { id: childId, status: 'ACTIVE', parent: { clerkId } },
      select: { id: true },
    });

    if (!child) throw new NotFoundException('Active child not found');
  }

  async list(clerkId: string, childId: string) {
    await this.assertActiveChild(clerkId, childId);
    const categories = await this.prisma.category.findMany({
      orderBy: [{ difficulty: 'asc' }, { name: 'asc' }],
      include: {
        words: {
          select: {
            id: true,
            progress: {
              where: { childId },
              select: { attempts: true, correctCount: true, masteryLevel: true, reviewAt: true },
            },
            exercises: { where: { isPublished: true }, select: { id: true } },
          },
        },
      },
    });

    return categories.map((category) => this.withProgress(category));
  }

  async get(clerkId: string, categoryId: string, childId: string) {
    await this.assertActiveChild(clerkId, childId);
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        words: {
          select: {
            id: true,
            progress: {
              where: { childId },
              select: { attempts: true, correctCount: true, masteryLevel: true, reviewAt: true },
            },
            exercises: { where: { isPublished: true }, select: { id: true } },
          },
        },
      },
    });

    if (!category) throw new NotFoundException('Category not found');
    return this.withProgress(category);
  }

  private withProgress(category: CategoryProgressRecord) {
    const availableWords = category.words.filter((word) => word.exercises.length > 0);
    const attemptedWords = availableWords.filter((word) => (word.progress[0]?.attempts ?? 0) > 0).length;
    const completedWords = availableWords.filter((word) => (word.progress[0]?.masteryLevel ?? 0) >= 3).length;
    const attempts = availableWords.reduce((total, word) => total + (word.progress[0]?.attempts ?? 0), 0);
    const correctCount = availableWords.reduce((total, word) => total + (word.progress[0]?.correctCount ?? 0), 0);
    const publishedExerciseCount = availableWords.reduce((total, word) => total + word.exercises.length, 0);

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      difficulty: category.difficulty,
      wordCount: availableWords.length,
      publishedExerciseCount,
      attemptedWords,
      completedWords,
      progressPercent: availableWords.length ? Math.round((completedWords / availableWords.length) * 100) : 0,
      accuracyPercent: attempts ? Math.round((correctCount / attempts) * 100) : 0,
      attempts,
      masteryLevel: availableWords.reduce((highest, word) => Math.max(highest, word.progress[0]?.masteryLevel ?? 0), 0),
      dueForReview: availableWords.filter((word) => {
        const reviewAt = word.progress[0]?.reviewAt;
        return reviewAt !== null && reviewAt !== undefined && reviewAt <= new Date();
      }).length,
    };
  }
}