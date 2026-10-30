import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type AuthenticatedUser = { userId: string; sessionId?: string };
type AuthRequest = Request & { authUser?: AuthenticatedUser };

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<AuthRequest>();
  if (!request.authUser) throw new Error('CurrentUser used without ClerkAuthGuard');
  return request.authUser;
});
