import {
  DynamicModule,
  Inject,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AuthController } from './auth.controller';
import {
  betterAuth,
  createAuthPool,
  createBetterAuth,
  type AuthStorage,
} from './better-auth';
import { SessionGuard } from './session.guard';

const AUTH_POOL = 'AUTH_POOL';

class AuthPoolLifecycle implements OnApplicationShutdown {
  private closed = false;

  constructor(@Inject(AUTH_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}

export type AuthModuleOptions = { storage: AuthStorage };

@Module({
  controllers: [AuthController],
  providers: [{ provide: 'BETTER_AUTH', useValue: betterAuth }, SessionGuard],
  exports: ['BETTER_AUTH'],
})
export class AuthModule {
  static forRoot(
    options: AuthModuleOptions = { storage: 'memory' },
  ): DynamicModule {
    const providers =
      options.storage === 'postgres'
        ? [
            {
              provide: 'BETTER_AUTH',
              inject: [AUTH_POOL, ConfigService],
              useFactory: (pool: Pool, config: ConfigService) =>
                createBetterAuth({
                  storage: 'postgres',
                  databaseUrl: config.getOrThrow<string>('DATABASE_URL'),
                  secret: config.getOrThrow<string>('BETTER_AUTH_SECRET'),
                  database: pool,
                }),
            },
            {
              provide: AUTH_POOL,
              inject: [ConfigService],
              useFactory: (config: ConfigService) =>
                createAuthPool(config.getOrThrow<string>('DATABASE_URL')),
            },
            AuthPoolLifecycle,
            SessionGuard,
          ]
        : [{ provide: 'BETTER_AUTH', useValue: betterAuth }, SessionGuard];

    return {
      module: AuthModule,
      controllers: [AuthController],
      providers,
      exports: ['BETTER_AUTH'],
    };
  }
}
