import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friendship, FriendshipStatus } from './friendship.entity';
import { User } from '../mvp/entities';

@Injectable()
export class FriendshipService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
