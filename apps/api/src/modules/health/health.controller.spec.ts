import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HealthController } from './health.controller';

const dataSourceMock = {
  query: vi.fn(),
} as unknown as DataSource;

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSourceMock }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    vi.clearAllMocks();
  });

  it('reports ok when the database responds', async () => {
    dataSourceMock.query.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check()).resolves.toEqual({ status: 'ok', db: 'up' });
    expect(dataSourceMock.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('throws 503 when the database is unreachable', async () => {
    dataSourceMock.query.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});