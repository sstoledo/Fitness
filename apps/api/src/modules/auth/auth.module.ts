import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SessionGuard } from './session.guard';
import { betterAuth } from './better-auth';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: 'BETTER_AUTH', useValue: betterAuth },
    SessionGuard,
  ],
  exports: ['BETTER_AUTH'],
})
export class AuthModule {}