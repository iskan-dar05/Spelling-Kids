import { NotFoundException } from '@nestjs/common';
import { LearningService } from './learning.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SpeechService } from '../speech/speech.service.js';

const word = {
  id: 'word-1', spelling: 'apple', exampleSentence: 'I eat an apple.', audioUrl: null,
  categoryId: 'category-1', category: { id: 'category-1', name: 'Fruit', difficulty: 1 },
  progress: [],
};

describe('LearningService', () => {
  const prisma = {
    childProfile: { findFirst: vi.fn() },
    category: { findUnique: vi.fn() },
    learningSession: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    exercise: { findFirst: vi.fn(), findMany: vi.fn() },
    exerciseAttempt: { findFirst: vi.fn(), create: vi.fn() },
    wordProgress: { findUnique: vi.fn(), upsert: vi.fn(), findFirst: vi.fn() },
    reward: { create: vi.fn() },
    $transaction: vi.fn(),
  } as unknown as PrismaService & Record<string, any>;
  const speech = { audioForWord: vi.fn() } as unknown as SpeechService;
  const service = new LearningService(prisma, speech);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not allow another parent to access a session', async () => {
    prisma.learningSession.findFirst.mockResolvedValue(null);
    await expect(service.current('other-parent', 'session-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('starts retry sessions from previously missed published exercises only', async () => {
    prisma.childProfile.findFirst.mockResolvedValue({ id: 'child-1' });
    prisma.category.findUnique.mockResolvedValue({ id: 'category-1' });
    prisma.exercise.findMany.mockResolvedValue([{
      id: 'exercise-1', type: 'SPELL_WORD', prompt: null, isPublished: true,
      wordId: 'word-1', difficulty: 1, word,
    }]);
    prisma.learningSession.create.mockResolvedValue({
      id: 'retry-session', childId: 'child-1', categoryId: 'category-1',
      status: 'IN_PROGRESS', retryMissedOnly: true, startedAt: new Date(),
    });

    await service.startOrResume('parent-1', {
      childId: 'child-1', categoryId: 'category-1', retryMissedOnly: true,
    });

    expect(prisma.exercise.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ attempts: { some: { childId: 'child-1', isCorrect: false } } }),
    }));
    expect(prisma.learningSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ retryMissedOnly: true }),
    }));
  });

  it.each([
    ['SPELL_WORD', { audioAvailable: true }],
    ['MISSING_LETTERS', { pattern: 'a_p_e' }],
    ['REORDER_LETTERS', { letterTiles: expect.any(Array) }],
    ['DICTATION', { audioAvailable: true }],
  ])('returns a safe %s question without its answer', async (type, expected) => {
    prisma.learningSession.findFirst.mockResolvedValue({
      id: 'session-1', childId: 'child-1', categoryId: 'category-1', status: 'IN_PROGRESS',
      currentExerciseId: 'exercise-1', servedExerciseIds: [],
    });
    prisma.exercise.findFirst.mockResolvedValue({
      id: 'exercise-1', type, prompt: null, isPublished: true, wordId: 'word-1', word,
    });

    const response = await service.current('parent-1', 'session-1');
    expect(response).toMatchObject({ complete: false, question: { ...expected, type } });
    expect(JSON.stringify(response)).not.toContain('apple');
    expect(JSON.stringify(response)).not.toContain('I eat an apple.');
  });

  it.each([
    ['SPELL_WORD', 'apple', true],
    ['MISSING_LETTERS', 'apple', true],
    ['REORDER_LETTERS', 'apple', true],
    ['DICTATION', 'I eat an apple.', true],
    ['SPELL_WORD', 'orange', false],
  ])('grades %s answer on the server', async (type, answer, correct) => {
    prisma.learningSession.findFirst.mockResolvedValue({
      id: 'session-1', childId: 'child-1', categoryId: 'category-1', status: 'IN_PROGRESS',
      currentExerciseId: 'exercise-1', servedExerciseIds: [], startedAt: new Date(), completedAt: null,
    });
    prisma.exerciseAttempt.findFirst.mockResolvedValue(null);
    prisma.exercise.findFirst.mockResolvedValue({
      id: 'exercise-1', type, prompt: null, isPublished: true, wordId: 'word-1', word,
    });
    const tx = {
      exerciseAttempt: { create: vi.fn().mockResolvedValue({ id: 'attempt-1', childId: 'child-1', exerciseId: 'exercise-1', isCorrect: correct, reward: null }) },
      wordProgress: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ attempts: 1, correctCount: correct ? 1 : 0, masteryLevel: correct ? 1 : 0, reviewAt: new Date() }) },
      reward: { create: vi.fn().mockResolvedValue({ id: 'reward-1', xp: 10 }) },
      exercise: { findMany: vi.fn().mockResolvedValue([]) },
      learningSession: { update: vi.fn() },
    };
    prisma.$transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await service.submit('parent-1', 'session-1', {
      answer, idempotencyKey: `${type}-${answer}`,
    });

    expect(result.correct).toBe(correct);
    expect(tx.exerciseAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ answer, isCorrect: correct }) }));
    expect(tx.wordProgress.upsert).toHaveBeenCalledOnce();
    expect(tx.reward.create).toHaveBeenCalledTimes(correct ? 1 : 0);
  });

  it('returns the saved result when an answer request is retried', async () => {
    prisma.learningSession.findFirst.mockResolvedValue({ id: 'session-1', childId: 'child-1', status: 'COMPLETED' });
    prisma.exerciseAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1', childId: 'child-1', exerciseId: 'exercise-1', isCorrect: true,
      reward: { xp: 10 },
    });
    prisma.wordProgress.findFirst.mockResolvedValue({ attempts: 1, correctCount: 1, masteryLevel: 1, reviewAt: null });
    prisma.learningSession.findUnique.mockResolvedValue({ status: 'COMPLETED' });

    const result = await service.submit('parent-1', 'session-1', { answer: 'apple', idempotencyKey: 'retry-key' });

    expect(result).toMatchObject({ correct: true, xpEarned: 10, replayed: true, sessionComplete: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});