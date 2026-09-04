import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('returns the hello message', async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    const appController = app.get<AppController>(AppController);
    expect(appController.getHello()).toBe('Hello World!');
  });
});