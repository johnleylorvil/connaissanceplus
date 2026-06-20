import { validate } from 'class-validator';
import { UpdateProfileDto } from './dto/mvp.dto';

describe('account preferences validation', () => {
  it('accepts supported tutor languages and notification preference', async () => {
    const dto = new UpdateProfileDto();
    dto.preferredTutorLanguage = 'ht';
    dto.notificationsEnabled = false;

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an unsupported tutor language', async () => {
    const dto = new UpdateProfileDto();
    dto.preferredTutorLanguage = 'en' as 'fr';

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
