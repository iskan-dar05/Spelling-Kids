import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const starter = await prisma.category.upsert({ where: { name: 'Everyday Words' }, update: {}, create: { name: 'Everyday Words', description: 'Simple words children use every day', difficulty: 1 } });
  const words = [
    { spelling: 'apple', definition: 'A round fruit', exampleSentence: 'I eat an apple.' },
    { spelling: 'house', definition: 'A building where people live', exampleSentence: 'My house is small.' },
    { spelling: 'friend', definition: 'A person you like and trust', exampleSentence: 'Sam is my friend.' },
  ];
  const exercises = [
    { suffix: 'spell', type: 'SPELL_WORD' as const, prompt: 'Listen and spell the word.' },
    { suffix: 'missing', type: 'MISSING_LETTERS' as const, prompt: 'Fill in the missing letters.' },
    { suffix: 'reorder', type: 'REORDER_LETTERS' as const, prompt: 'Put the letters in the right order.' },
    { suffix: 'dictation', type: 'DICTATION' as const, prompt: 'Listen, then write what you heard.' },
  ];
  for (const item of words) {
    const word = await prisma.word.upsert({ where: { categoryId_spelling: { categoryId: starter.id, spelling: item.spelling } }, update: item, create: { categoryId: starter.id, ...item } });
    for (const exercise of exercises) {
      const id = exercise.suffix === 'spell' ? `seed-spell-${word.id}` : `seed-${exercise.suffix}-${word.id}`;
      await prisma.exercise.upsert({
        where: { id },
        update: { prompt: exercise.prompt, isPublished: true },
        create: { id, wordId: word.id, type: exercise.type, difficulty: 1, prompt: exercise.prompt, isPublished: true },
      });
    }
  }
  console.log('Seeded starter spelling category, words, and published exercise types.');
}
main().finally(async () => prisma.$disconnect());
