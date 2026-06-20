import { ROLES_KEY } from '../mvp/auth/roles.guard';
import { UserRole } from '../mvp/entities';
import { AdminInsightsController } from './admin-insights.controller';

describe('AdminInsightsController', () => {
  it('is restricted to administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminInsightsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });
});
