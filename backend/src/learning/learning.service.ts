import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SpeechService } from '../speech/speech.service.js';
import type { StartSessionDto } from './dto/start-session.dto.js';
import type { SubmitAnswerDto } from './dto/submit-answer.dto.js';

const exerciseInclude = (childId: string) => ({
  word: {
    include: {
      category: { select: { id: true, name: true, difficulty: true } },
      progress: {
        where: { childId },
        select: { childId: true, attempts: true, masteryLevel: true, reviewAt: true },
      },
    },
  },
} satisfies Prisma.ExerciseInclude);

type ExerciseWithWord = Prisma.ExerciseGetPayload<{ include: ReturnType<typeof exerciseInclude> }>;

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly speech: SpeechService,
  ) {}

  async startOrResume(clerkId: string, dto: StartSessionDto) {
    await this.assertActiveChild(clerkId, dto.childId);
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    let session = dto.retryMissedOnly ? null : await this.prisma.learningSession.findFirst({
      where: { childId: dto.childId, categoryId: dto.categoryId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
    });
    const resumed = Boolean(session);

    if (!session) {
      const first = await this.selectExercise(dto.categoryId, dto.childId, [], this.prisma, dto.retryMissedOnly ?? false);
      if (!first) throw new ConflictException('This category has no available published exercises.');
      session = await this.prisma.learningSession.create({
        data: {
          childId: dto.childId,
          categoryId: dto.categoryId,
          retryMissedOnly: dto.retryMissedOnly ?? false,
          currentExerciseId: first.id,
        },
      });
    }

    return {
      id: session.id,
      categoryId: session.categoryId,
      status: session.status,
      startedAt: session.startedAt,
      resumed,
    };
  }

  async current(clerkId: string, sessionId: string) {
    const session = await this.ownedSession(clerkId, sessionId);
    if (session.status !== 'IN_PROGRESS') return { sessionId, complete: true };

    if (session.currentExerciseId) {
      const current = await this.prisma.exercise.findFirst({
        where: {
          id: session.currentExerciseId,
          isPublished: true,
          word: { categoryId: session.categoryId },
        },
        include: exerciseInclude(session.childId),
      });
      if (current) return { sessionId, complete: false, question: this.question(current) };
    }

    const served = this.asStringArray(session.servedExerciseIds);
    const next = await this.selectExercise(session.categoryId, session.childId, served, this.prisma, session.retryMissedOnly);
    if (!next) {
      await this.prisma.learningSession.update({
        where: { id: session.id },
        data: { status: 'COMPLETED', completedAt: new Date(), currentExerciseId: null },
      });
      return { sessionId, complete: true };
    }

    await this.prisma.learningSession.update({
      where: { id: session.id },
      data: { currentExerciseId: next.id },
    });
    return { sessionId, complete: false, question: this.question(next) };
  }

  async next(clerkId: string, sessionId: string) {
    const session = await this.ownedSession(clerkId, sessionId);
    if (session.status !== 'IN_PROGRESS') return { sessionId, complete: true };

    const served = this.asStringArray(session.servedExerciseIds);
    if (session.currentExerciseId) {
      const currentWasAnswered = await this.prisma.exerciseAttempt.findFirst({
        where: { sessionId, exerciseId: session.currentExerciseId },
        select: { id: true },
      });
      if (!currentWasAnswered) return this.current(clerkId, sessionId);
    }

    const next = await this.selectExercise(session.categoryId, session.childId, served, this.prisma, session.retryMissedOnly);
    if (!next) {
      await this.prisma.learningSession.update({
        where: { id: session.id },
        data: { status: 'COMPLETED', completedAt: new Date(), currentExerciseId: null },
      });
      return { sessionId, complete: true };
    }

    await this.prisma.learningSession.update({
      where: { id: session.id },
      data: { currentExerciseId: next.id },
    });
    return { sessionId, complete: false, question: this.question(next) };
  }

  async submit(clerkId: string, sessionId: string, dto: SubmitAnswerDto) {
    const session = await this.ownedSession(clerkId, sessionId);
    const previous = await this.prisma.exerciseAttempt.findFirst({
      where: { childId: session.childId, sessionId, idempotencyKey: dto.idempotencyKey },
      include: { reward: true },
    });
    if (previous) return this.answerResult(previous, session.id, true);

    if (session.status !== 'IN_PROGRESS' || !session.currentExerciseId) {
      throw new ConflictException('There is no active question to answer.');
    }

    const exercise = await this.prisma.exercise.findFirst({
      where: {
        id: session.currentExerciseId,
        isPublished: true,
        word: { categoryId: session.categoryId },
      },
      include: exerciseInclude(session.childId),
    });
    if (!exercise) throw new NotFoundException('Published exercise not found');

    const expected = this.answerKey(exercise);
    const correct = this.normalize(dto.answer) === this.normalize(expected);
    const now = new Date();

    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const attempt = await tx.exerciseAttempt.create({
          data: {
            childId: session.childId,
            exerciseId: exercise.id,
            sessionId: session.id,
            idempotencyKey: dto.idempotencyKey,
            answer: dto.answer.trim(),
            isCorrect: correct,
            durationMs: dto.durationMs,
          },
        });

        const progress = await tx.wordProgress.findUnique({
          where: { childId_wordId: { childId: session.childId, wordId: exercise.wordId } },
          select: { masteryLevel: true },
        });
        const masteryLevel = Math.max(0, Math.min(3, (progress?.masteryLevel ?? 0) + (correct ? 1 : -1)));
        const reviewAt = new Date(now.getTime() + this.reviewDays(masteryLevel) * 86_400_000);
        const updatedProgress = await tx.wordProgress.upsert({
          where: { childId_wordId: { childId: session.childId, wordId: exercise.wordId } },
          create: {
            childId: session.childId,
            wordId: exercise.wordId,
            attempts: 1,
            correctCount: correct ? 1 : 0,
            masteryLevel,
            reviewAt,
          },
          update: {
            attempts: { increment: 1 },
            ...(correct ? { correctCount: { increment: 1 } } : {}),
            masteryLevel,
            reviewAt,
          },
        });

        const reward = correct
          ? await tx.reward.create({
              data: {
                childId: session.childId,
                kind: 'CORRECT_ANSWER',
                xp: 10,
                sourceAttemptId: attempt.id,
                metadata: { exerciseId: exercise.id, sessionId: session.id },
              },
            })
          : null;

        const served = [...this.asStringArray(session.servedExerciseIds), exercise.id];
        const nextExercise = await this.selectExercise(session.categoryId, session.childId, served, tx, session.retryMissedOnly);
        await tx.learningSession.update({
          where: { id: session.id },
          data: {
            servedExerciseIds: served,
            currentExerciseId: null,
            ...(!nextExercise ? { status: 'COMPLETED', completedAt: now } : {}),
          },
        });

        return { attempt, progress: updatedProgress, reward, nextAvailable: Boolean(nextExercise) };
      });

      return {
        correct,
        feedback: correct ? 'That is right. Great spelling!' : 'Not quite. Keep practising!',
        xpEarned: saved.reward?.xp ?? 0,
        progress: saved.progress,
        nextAvailable: saved.nextAvailable,
        sessionComplete: !saved.nextAvailable,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.exerciseAttempt.findFirst({
          where: { childId: session.childId, sessionId, idempotencyKey: dto.idempotencyKey },
          include: { reward: true },
        });
        if (duplicate) return this.answerResult(duplicate, session.id, true);
      }
      throw error;
    }
  }

  async complete(clerkId: string, sessionId: string) {
    const session = await this.ownedSession(clerkId, sessionId);
    if (session.status === 'ABANDONED') throw new ConflictException('This session was abandoned.');
    const completed = await this.prisma.learningSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', completedAt: session.completedAt ?? new Date(), currentExerciseId: null },
      select: { id: true, status: true, startedAt: true, completedAt: true },
    });
    return completed;
  }

  async abandon(clerkId: string, sessionId: string) {
    const session = await this.ownedSession(clerkId, sessionId);
    return this.prisma.learningSession.update({
      where: { id: session.id },
      data: { status: 'ABANDONED', completedAt: new Date(), currentExerciseId: null },
      select: { id: true, status: true, startedAt: true, completedAt: true },
    });
  }

  async summary(clerkId: string, sessionId: string) {
    const session = await this.ownedSession(clerkId, sessionId);
    const [attempts, wordCount, rewardTotal] = await Promise.all([
      this.prisma.exerciseAttempt.findMany({
        where: { sessionId },
        select: { exerciseId: true, isCorrect: true, durationMs: true },
      }),
      this.prisma.word.count({
        where: { categoryId: session.categoryId, exercises: { some: { isPublished: true } } },
      }),
      this.prisma.reward.aggregate({ where: { sourceAttempt: { sessionId } }, _sum: { xp: true }, _count: true }),
    ]);
    const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
    const elapsedMs = Math.max(0, (session.completedAt ?? new Date()).getTime() - session.startedAt.getTime());
    return {
      sessionId,
      childId: session.childId,
      categoryId: session.categoryId,
      status: session.status,
      wordCount,
      attemptedWords: await this.prisma.wordProgress.count({
        where: { childId: session.childId, attempts: { gt: 0 }, word: { categoryId: session.categoryId, exercises: { some: { isPublished: true } } } },
      }),
      completedWords: await this.prisma.wordProgress.count({
        where: { childId: session.childId, masteryLevel: { gte: 3 }, word: { categoryId: session.categoryId, exercises: { some: { isPublished: true } } } },
      }),
      attemptCount: attempts.length,
      missedQuestionCount: new Set(attempts.filter((attempt) => !attempt.isCorrect).map((attempt) => attempt.exerciseId)).size,
      accuracyPercent: attempts.length ? Math.round((correctCount / attempts.length) * 100) : 0,
      durationSeconds: Math.round(elapsedMs / 1000),
      xpEarned: rewardTotal._sum.xp ?? 0,
      rewardsEarned: rewardTotal._count,
    };
  }

  async childSummary(clerkId: string, childId: string) {
    await this.assertActiveChild(clerkId, childId);
    const [progressRows, attempts, rewards] = await Promise.all([
      this.prisma.wordProgress.findMany({
        where: { childId, word: { exercises: { some: { isPublished: true } } } },
        include: { word: { include: { category: true, exercises: { where: { isPublished: true }, select: { id: true } } } } },
      }),
      this.prisma.exerciseAttempt.findMany({
        where: { childId, exercise: { isPublished: true } },
        select: { isCorrect: true, exercise: { select: { word: { select: { categoryId: true } } } } },
      }),
      this.prisma.reward.aggregate({ where: { childId }, _sum: { xp: true }, _count: true }),
    ]);

    const categories = new Map<string, {
      id: string; name: string; difficulty: number; wordCount: number; attemptedWords: number;
      completedWords: number; dueForReview: number; attempts: number; correctCount: number;
    }>();

    for (const row of progressRows) {
      const current = categories.get(row.word.categoryId) ?? {
        id: row.word.category.id,
        name: row.word.category.name,
        difficulty: row.word.category.difficulty,
        wordCount: 0,
        attemptedWords: 0,
        completedWords: 0,
        dueForReview: 0,
        attempts: 0,
        correctCount: 0,
      };
      current.wordCount += 1;
      if (row.attempts > 0) current.attemptedWords += 1;
      if (row.masteryLevel >= 3) current.completedWords += 1;
      if (row.reviewAt && row.reviewAt <= new Date()) current.dueForReview += 1;
      current.attempts += row.attempts;
      current.correctCount += row.correctCount;
      categories.set(row.word.categoryId, current);
    }

    const publishedWordCounts = await this.prisma.word.groupBy({
      by: ['categoryId'],
      where: { exercises: { some: { isPublished: true } } },
      _count: { id: true },
    });
    for (const item of publishedWordCounts) {
      const category = await this.prisma.category.findUnique({ where: { id: item.categoryId }, select: { id: true, name: true, difficulty: true } });
      if (!category) continue;
      const current = categories.get(item.categoryId) ?? {
        ...category, wordCount: 0, attemptedWords: 0, completedWords: 0,
        dueForReview: 0, attempts: 0, correctCount: 0,
      };
      current.wordCount = item._count.id;
      categories.set(item.categoryId, current);
    }

    const attemptsByCategory = new Map<string, { attempts: number; correct: number }>();
    for (const attempt of attempts) {
      const categoryId = attempt.exercise.word.categoryId;
      const totals = attemptsByCategory.get(categoryId) ?? { attempts: 0, correct: 0 };
      totals.attempts += 1;
      if (attempt.isCorrect) totals.correct += 1;
      attemptsByCategory.set(categoryId, totals);
    }

    const categorySummaries = [...categories.values()].map((category) => {
      const totals = attemptsByCategory.get(category.id) ?? { attempts: 0, correct: 0 };
      return {
        ...category,
        accuracyPercent: totals.attempts ? Math.round((totals.correct / totals.attempts) * 100) : 0,
        progressPercent: category.wordCount ? Math.round((category.completedWords / category.wordCount) * 100) : 0,
      };
    }).sort((left, right) => left.difficulty - right.difficulty || left.name.localeCompare(right.name));

    const attemptCount = attempts.length;
    const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
    return {
      childId,
      wordCount: publishedWordCounts.reduce((total, item) => total + item._count.id, 0),
      attemptedWords: progressRows.filter((row) => row.attempts > 0).length,
      completedWords: progressRows.filter((row) => row.masteryLevel >= 3).length,
      dueForReview: progressRows.filter((row) => row.reviewAt && row.reviewAt <= new Date()).length,
      attemptCount,
      accuracyPercent: attemptCount ? Math.round((correctCount / attemptCount) * 100) : 0,
      xp: rewards._sum.xp ?? 0,
      rewardsEarned: rewards._count,
      categories: categorySummaries,
    };
  }

  async audio(clerkId: string, sessionId: string) {
    const session = await this.ownedSession(clerkId, sessionId);
    if (!session.currentExerciseId) throw new ConflictException('There is no active question.');
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: session.currentExerciseId, isPublished: true, word: { categoryId: session.categoryId } },
      include: { word: true },
    });
    if (!exercise) throw new NotFoundException('Published exercise not found');
    const text = this.answerKey(exercise);
    return this.speech.audioForWord(text, exercise.word.audioUrl);
  }

  private async assertActiveChild(clerkId: string, childId: string) {
    const child = await this.prisma.childProfile.findFirst({
      where: { id: childId, status: 'ACTIVE', parent: { clerkId } },
      select: { id: true },
    });
    if (!child) throw new NotFoundException('Active child not found');
  }

  private async ownedSession(clerkId: string, sessionId: string) {
    const session = await this.prisma.learningSession.findFirst({
      where: { id: sessionId, child: { status: 'ACTIVE', parent: { clerkId } } },
    });
    if (!session) throw new NotFoundException('Learning session not found');
    return session;
  }

  private async selectExercise(
    categoryId: string,
    childId: string,
    served: string[],
    client: PrismaService | Prisma.TransactionClient = this.prisma,
    retryMissedOnly = false,
  ): Promise<ExerciseWithWord | null> {
    const exercises = await client.exercise.findMany({
      where: {
        isPublished: true,
        id: { notIn: served },
        word: { categoryId },
        ...(retryMissedOnly ? { attempts: { some: { childId, isCorrect: false } } } : {}),
      },
      include: exerciseInclude(childId),
      orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
    });
    const candidates = exercises.filter((item) => this.isRenderable(item));
    candidates.sort((left, right) => {
      const score = (exercise: ExerciseWithWord) => {
        const progress = exercise.word.progress.find((record) => record.childId === childId);
        if (!progress || progress.attempts === 0) return 0;
        if (progress.reviewAt && progress.reviewAt <= new Date()) return 1;
        if (progress.masteryLevel < 3) return 2;
        return 3;
      };
      return score(left) - score(right) || left.difficulty - right.difficulty || left.id.localeCompare(right.id);
    });
    return candidates[0] ?? null;
  }

  private isRenderable(exercise: ExerciseWithWord) {
    const letters = Array.from(exercise.word.spelling);
    if (exercise.type === 'MISSING_LETTERS' && letters.length < 2) return false;
    if (exercise.type === 'REORDER_LETTERS' && new Set(letters).size < 2) return false;
    if (exercise.type === 'DICTATION' && !exercise.word.exampleSentence?.trim() && !exercise.word.spelling.trim()) return false;
    return true;
  }

  private question(exercise: ExerciseWithWord) {
    const word = exercise.word.spelling;
    const letters = Array.from(word);
    const shared = {
      id: exercise.id,
      type: exercise.type,
      prompt: exercise.prompt ?? this.defaultPrompt(exercise.type),
      category: exercise.word.category,
      audioAvailable: exercise.type === 'SPELL_WORD' || exercise.type === 'DICTATION',
    };
    if (exercise.type === 'MISSING_LETTERS') {
      const hidden = this.hiddenPattern(letters);
      return { ...shared, pattern: hidden };
    }
    if (exercise.type === 'REORDER_LETTERS') {
      return { ...shared, letterTiles: this.shuffle(letters, exercise.id) };
    }
    return shared;
  }

  private hiddenPattern(letters: string[]) {
    const positions = letters.map((letter, index) => ({ letter, index })).filter(({ letter }) => /[\p{L}\p{N}]/u.test(letter));
    let hidden = new Set(positions.filter(({ index }) => index > 0 && index < letters.length - 1 && index % 2 === 1).map(({ index }) => index));
    if (!hidden.size && positions.length) hidden = new Set([positions.at(-1)!.index]);
    return letters.map((letter, index) => hidden.has(index) ? '_' : letter).join('');
  }

  private shuffle(letters: string[], seed: string) {
    const result = [...letters];
    let value = Array.from(seed).reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
    for (let index = result.length - 1; index > 0; index -= 1) {
      value = (value * 1664525 + 1013904223) >>> 0;
      const target = value % (index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    if (result.join('') === letters.join('')) result.push(result.shift()!);
    return result;
  }

  private defaultPrompt(type: string) {
    if (type === 'MISSING_LETTERS') return 'Fill in the missing letters.';
    if (type === 'REORDER_LETTERS') return 'Put the letters in the right order.';
    if (type === 'DICTATION') return 'Listen, then write what you heard.';
    return 'Listen and spell the word.';
  }

  private answerKey(exercise: { type: string; word: { spelling: string; exampleSentence: string | null } }) {
    if (exercise.type === 'DICTATION' && exercise.word.exampleSentence?.trim()) {
      return exercise.word.exampleSentence.trim();
    }
    return exercise.word.spelling;
  }

  private normalize(value: string) {
    return value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
  }

  private reviewDays(masteryLevel: number) {
    return masteryLevel >= 3 ? 7 : masteryLevel === 2 ? 3 : 1;
  }

  private asStringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private async answerResult(
    attempt: Prisma.ExerciseAttemptGetPayload<{ include: { reward: true } }>,
    sessionId: string,
    replayed: boolean,
  ) {
    const [progress, remaining] = await Promise.all([
      this.prisma.wordProgress.findFirst({
        where: { childId: attempt.childId, word: { exercises: { some: { id: attempt.exerciseId } } } },
        select: { attempts: true, correctCount: true, masteryLevel: true, reviewAt: true },
      }),
      this.prisma.learningSession.findUnique({ where: { id: sessionId }, select: { status: true } }),
    ]);
    return {
      correct: attempt.isCorrect,
      feedback: attempt.isCorrect ? 'That is right. Great spelling!' : 'Not quite. Keep practising!',
      xpEarned: attempt.reward?.xp ?? 0,
      progress,
      nextAvailable: remaining?.status === 'IN_PROGRESS',
      sessionComplete: remaining?.status === 'COMPLETED',
      replayed,
    };
  }
}