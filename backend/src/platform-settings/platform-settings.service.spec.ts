/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';

describe('PlatformSettingsService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, updatedAt: new Date() })),
    merge: jest.fn((target, ...sources) => Object.assign(target, ...sources)),
  };
  const values: Record<string, string> = {
    OPENAI_API_KEY: 'secret',
    OPENAI_MODEL: 'gpt-test',
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  let service: PlatformSettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(null);
    service = new PlatformSettingsService(repo as never, config as never);
    await service.onModuleInit();
  });

  it('persists settings and refreshes the in-memory value', async () => {
    const updated = await service.update({
      organizationName: '  Académie Test  ',
      tutorEnabled: false,
    });
    expect(updated.organizationName).toBe('Académie Test');
    expect(service.get().tutorEnabled).toBe(false);
  });

  it('enforces the configured password length', async () => {
    await service.update({ minimumPasswordLength: 10 });
    expect(() => service.assertPassword('court')).toThrow(BadRequestException);
    expect(() => service.assertPassword('motdepasse-solide')).not.toThrow();
  });

  it('reports integration readiness without returning secret values', () => {
    const status = service.integrationStatus();
    expect(status.openai.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(status.google.configured).toBe(false);
  });
});
