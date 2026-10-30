import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import type { AuthenticatedUser } from './current-user.decorator.js';

type AuthRequest = Request & 
      { 
        authUser?: AuthenticatedUser 
      };

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Missing Bearer token');
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new UnauthorizedException('Clerk is not configured on the server');
    try {
      const claims = await verifyToken(token, { secretKey });
      if (!claims.sub) throw new UnauthorizedException('Token has no subject');
      request.authUser = { userId: claims.sub, sessionId: typeof claims.sid === 'string' ? claims.sid : undefined };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired Clerk token');
    }
  }
}
