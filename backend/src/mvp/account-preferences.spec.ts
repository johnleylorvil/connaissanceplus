import { validate } from 'class-validator';
import { JoinMatchmakingDto, RegisterStudentDto, UpdateProfileDto } from './dto/mvp.dto';
import { UserGender } from './entities';

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


describe('student profile and duel validation', () => {
  it('accepts student gender during registration and profile updates', async () => {
    const registerDto = new RegisterStudentDto();
    registerDto.firstName = 'Anne';
    registerDto.lastName = 'Eleve';
    registerDto.email = 'anne@example.com';
    registerDto.password = 'secret1';
    registerDto.gender = UserGender.FEMININ;
    registerDto.classId = '2f7b6f42-7b5f-48e5-8ad2-7836ed6cc9ef';
    registerDto.canBeContacted = false;
    registerDto.acceptedPrivacyPolicy = true;

    const profileDto = new UpdateProfileDto();
    profileDto.gender = UserGender.MASCULIN;

    expect(await validate(registerDto)).toHaveLength(0);
    expect(await validate(profileDto)).toHaveLength(0);
  });

  it('validates ranked duel duration choices', async () => {
    const dto = new JoinMatchmakingDto();
    dto.subjectId = '2f7b6f42-7b5f-48e5-8ad2-7836ed6cc9ef';
    dto.durationMinutes = 5;

    expect(await validate(dto)).toHaveLength(0);

    dto.durationMinutes = 7 as 5;
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
