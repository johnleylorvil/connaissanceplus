import { BadRequestException } from '@nestjs/common';
import { MvpService } from './mvp.service';
import { UserRole } from './entities';

describe('MvpService user account lifecycle', () => {
  const makeService = (user: Record<string, unknown>, activeAdmins = 1) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(user),
      count: jest.fn().mockResolvedValue(activeAdmins),
      save: jest
        .fn()
        .mockImplementation((value: unknown) => Promise.resolve(value)),
    };
    const service = Object.create(MvpService.prototype) as MvpService;
    Object.defineProperty(service, 'userRepo', { value: repo });
    return { service, repo };
  };

  const user = (role: UserRole = UserRole.STUDENT) => ({
    id: 'target',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    password: 'secret',
    role,
    classId: null,
    acceptedPrivacyPolicy: true,
    isActive: true,
    suspendedAt: null,
    suspendedByUserId: null,
    suspensionReason: null,
  });

  it('refuses self-suspension', async () => {
    const { service } = makeService(user(UserRole.ADMIN));
    await expect(
      service.suspendUser('same', 'same', { reason: 'Motif valide' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('protects the last active administrator', async () => {
    const { service, repo } = makeService(user(UserRole.ADMIN), 1);
    await expect(
      service.suspendUser('admin', 'target', { reason: 'Motif valide' }),
    ).rejects.toThrow('dernier administrateur');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('suspends a user and records the administrator and reason', async () => {
    const target = user();
    const { service, repo } = makeService(target);
    const result = await service.suspendUser('admin', 'target', {
      reason: '  Non-respect des règles  ',
    });
    expect(result.isActive).toBe(false);
    expect(result.suspendedByUserId).toBe('admin');
    expect(result.suspensionReason).toBe('Non-respect des règles');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('reactivates an account and clears suspension metadata', async () => {
    const target = {
      ...user(),
      isActive: false,
      suspendedAt: new Date(),
      suspendedByUserId: 'admin',
      suspensionReason: 'Motif',
    };
    const { service } = makeService(target);
    const result = await service.reactivateUser('target');
    expect(result).toMatchObject({
      isActive: true,
      suspendedAt: null,
      suspendedByUserId: null,
      suspensionReason: null,
    });
  });
});
