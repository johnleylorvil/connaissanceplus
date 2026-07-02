import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friendship, FriendshipStatus } from './friendship.entity';
import { User } from '../mvp/entities';

type FriendshipProfile = {
  userId: string;
  name: string;
  academicLevelName: string | null;
  avatarUrl: string | null;
};

function toFriendshipProfile(user?: User | null): FriendshipProfile | null {
  if (!user) return null;
  return {
    userId: user.id,
    name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Utilisateur',
    academicLevelName: user.academicClass?.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}
@Injectable()
export class FriendshipService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}


  async listFriendships(userId: string) {
    const rows = await this.friendshipRepo.find({
      where: [
        { requesterUserId: userId },
        { addresseeUserId: userId },
      ],
      relations: ['requester', 'requester.academicClass', 'addressee', 'addressee.academicClass'],
      order: { updatedAt: 'DESC' },
    });

    return {
      incoming: rows
        .filter((item) => item.addresseeUserId === userId && item.status === FriendshipStatus.PENDING)
        .map((item) => ({
          id: item.id,
          status: item.status,
          createdAt: item.createdAt,
          requester: toFriendshipProfile(item.requester),
        })),
      outgoing: rows
        .filter((item) => item.requesterUserId === userId && item.status === FriendshipStatus.PENDING)
        .map((item) => ({
          id: item.id,
          status: item.status,
          createdAt: item.createdAt,
          addressee: toFriendshipProfile(item.addressee),
        })),
      friends: rows
        .filter((item) => item.status === FriendshipStatus.ACCEPTED)
        .map((item) => ({
          id: item.id,
          status: item.status,
          friend: toFriendshipProfile(item.requesterUserId === userId ? item.addressee : item.requester),
        })),
    };
  }

  async requestFriend(requesterUserId: string, addresseeUserId: string) {
    if (requesterUserId === addresseeUserId) {
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-meme.');
    }

    const addressee = await this.userRepo.findOne({ where: { id: addresseeUserId } });
    if (!addressee) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const existing = await this.friendshipRepo.findOne({
      where: [
        { requesterUserId, addresseeUserId },
        { requesterUserId: addresseeUserId, addresseeUserId: requesterUserId },
      ],
    });

    if (existing) {
      return {
        ...existing,
        friendshipState: existing.status === FriendshipStatus.ACCEPTED ? 'already_friends' : 'pending',
      };
    }

    const friendship = await this.friendshipRepo.save(
      this.friendshipRepo.create({
        requesterUserId,
        addresseeUserId,
        status: FriendshipStatus.PENDING,
      }),
    );

    return { ...friendship, friendshipState: 'pending' };
  }

  async acceptFriend(userId: string, friendshipId: string) {
    const friendship = await this.friendshipRepo.findOne({ where: { id: friendshipId } });
    if (!friendship) {
      throw new NotFoundException('Demande introuvable.');
    }
    if (friendship.addresseeUserId !== userId) {
      throw new UnauthorizedException('Vous ne pouvez accepter que vos demandes recues.');
    }

    friendship.status = FriendshipStatus.ACCEPTED;
    const saved = await this.friendshipRepo.save(friendship);
    return { ...saved, friendshipState: 'already_friends' };
  }
}
