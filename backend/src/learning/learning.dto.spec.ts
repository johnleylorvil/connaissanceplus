import { validate } from 'class-validator';
import { SendTutorMessageDto } from './learning.dto';
import { TutorLanguage } from './learning.entities';

describe('SendTutorMessageDto', () => {
  it('rejects questions longer than 2000 characters', async () => {
    const dto = new SendTutorMessageDto();
    dto.language = TutorLanguage.FRENCH;
    dto.message = 'a'.repeat(2001);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
