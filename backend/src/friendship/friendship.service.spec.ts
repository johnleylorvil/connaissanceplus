import { BadRequestException } from '@nestjs/common';
import { FriendshipService } from './friendship.service';
import { FriendshipStatus } from './friendship.entity';

describe('FriendshipService', () => {
  const makeService = () => {
    const friendshipRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'friendship-1', ...value })),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'u2' }),
    };
    const service = new FriendshipService(friendshipRepo as never, userRepo as never);
    return { service, friendshipRepo, userRepo };
  };

  it('refuses self friend requests', async () => {
    const { service } = makeService();
    await expect(service.requestFriend('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a pending request when no relationship exists', async () => {
    const { service, friendshipRepo } = makeService();
    friendshipRepo.findOne.mockResolvedValue(null);

    const result = await service.requestFriend('u1', 'u2');

    expect(friendshipRepo.create).toHaveBeenCalledWith({
      requesterUserId: 'u1',
      addresseeUserId: 'u2',
      status: FriendshipStatus.PENDING,
    });
    expect(result.friendshipState).toBe('pending');
  });

  it('returns already_friends for an accepted relationship', async () => {
    const { service, friendshipRepo } = makeService();
    friendshipRepo.findOne.mockResolvedValue({
      id: 'friendship-1',
      requesterUserId: 'u2',
      addresseeUserId: 'u1',
      status: FriendshipStatus.ACCEPTED,
    });

    const result = await service.requestFriend('u1', 'u2');

    expect(result.friendshipState).toBe('already_friends');
    expect(friendshipRepo.save).not.toHaveBeenCalled();
  });
});
