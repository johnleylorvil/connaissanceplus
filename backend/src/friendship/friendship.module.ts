import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendshipController } from './friendship.controller';
import { Friendship } from './friendship.entity';
import { FriendshipService } from './friendship.service';
import { User } from '../mvp/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Friendship, User])],
  controllers: [FriendshipController],
  providers: [FriendshipService],
})
export class FriendshipModule {}
