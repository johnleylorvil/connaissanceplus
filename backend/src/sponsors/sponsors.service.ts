import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sponsor } from './sponsor.entity';
import { CreateSponsorDto, UpdateSponsorDto } from './sponsors.dto';

@Injectable()
export class SponsorsService {
  constructor(
    @InjectRepository(Sponsor)
    private readonly sponsorRepo: Repository<Sponsor>,
  ) {}

  getAdminSponsors() {
    return this.sponsorRepo.find({
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async createAdminSponsor(dto: CreateSponsorDto) {
    const sponsor = this.sponsorRepo.create({
      name: dto.name,
      logoUrl: dto.logoUrl,
      websiteUrl: dto.websiteUrl ?? null,
      isActive: dto.isActive ?? true,
      displayOrder: dto.displayOrder ?? 0,
    });
    return this.sponsorRepo.save(sponsor);
  }

  async updateAdminSponsor(id: string, dto: UpdateSponsorDto) {
    const sponsor = await this.sponsorRepo.findOne({ where: { id } });
    if (!sponsor) {
      throw new NotFoundException('Sponsor introuvable');
    }

    if (dto.name !== undefined) sponsor.name = dto.name;
    if (dto.logoUrl !== undefined) sponsor.logoUrl = dto.logoUrl;
    if (dto.websiteUrl !== undefined) sponsor.websiteUrl = dto.websiteUrl || null;
    if (dto.isActive !== undefined) sponsor.isActive = dto.isActive;
    if (dto.displayOrder !== undefined) sponsor.displayOrder = dto.displayOrder;

    return this.sponsorRepo.save(sponsor);
  }

  async deleteAdminSponsor(id: string) {
    const sponsor = await this.sponsorRepo.findOne({ where: { id } });
    if (!sponsor) {
      throw new NotFoundException('Sponsor introuvable');
    }

    await this.sponsorRepo.delete({ id });
    return { success: true };
  }

  getPublicSponsors() {
    return this.sponsorRepo.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        websiteUrl: true,
        displayOrder: true,
      },
    });
  }
}
