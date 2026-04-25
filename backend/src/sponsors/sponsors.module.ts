import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sponsor } from './sponsor.entity';
import { SponsorsController } from './sponsors.controller';
import { SponsorsService } from './sponsors.service';
import { RolesGuard } from '../mvp/auth/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Sponsor])],
  controllers: [SponsorsController],
  providers: [SponsorsService, RolesGuard],
})
export class SponsorsModule {}
