import { Body, Controller, Param, Patch, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../mvp/auth/jwt-auth.guard';
import { FriendRequestDto } from './friendship.dto';
import { FriendshipService } from './friendship.service';

type AuthenticatedRequest = {
  user: {
    id: string;
  };
};

@Controller('api/friends')
@UseGuards(JwtAuthGuard)
export class FriendshipController {
  constructor(private readonly friendshipService: FriendshipService) {}

  @Post('request')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  requestFriend(@Req() request: AuthenticatedRequest, @Body() dto: FriendRequestDto) {
    return this.friendshipService.requestFriend(request.user.id, dto.addresseeUserId);
  }

  @Patch(':id/accept')
  acceptFriend(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.friendshipService.acceptFriend(request.user.id, id);
  }
}
