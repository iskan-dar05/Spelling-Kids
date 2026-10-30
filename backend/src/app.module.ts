import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ParentsModule } from './parents/parents.module.js';
import { ChildrenModule } from './children/children.module.js';
import { SpeechModule } from './speech/speech.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { LearningModule } from './learning/learning.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ParentsModule, ChildrenModule, SpeechModule, CategoriesModule, LearningModule],
})
export class AppModule {}
