import { Module } from '@nestjs/common';
import { betterAuth } from './better-auth';

@Module({
  providers: [{ provide: 'BETTER_AUTH', useValue: betterAuth }],
  exports: ['BETTER_AUTH'],
})
export class AuthModule {}