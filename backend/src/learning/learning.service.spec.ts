import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AcademicClass, Subject, User, UserRole } from '../mvp/entities';
import {
  Chapter,
  ChapterStatus,
  TutorConversation,
  TutorLanguage,
  TutorMessage,
} from './learning.entities';
import { LearningService } from './learning.service';
import { OpenAiTutorService } from './openai-tutor.service';

type MockRepo = Record<string, jest.Mock>;
const repo = (): MockRepo => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((value: unknown) => ({ ...(value as object) })),
  save: jest.fn((value: unknown) => Promise.resolve(value)),
  remove: jest.fn((value: unknown) => Promise.resolve(value)),
});

const subject = {
  id: 'subject-1',
  name: 'Mathematiques',
  classId: 'class-1',
  academicClass: { id: 'class-1', name: '9e annee' },
} as Subject;
const publishedChapter = {
  id: 'chapter-1',
  subjectId: subject.id,
  subject,
  title: 'Fractions',
  summary: 'Comprendre les fractions',
  content: 'Une fraction represente une partie.',
  position: 1,
  status: ChapterStatus.PUBLISHED,
} as Chapter;

describe('LearningService', () => {
  let service: LearningService;
  let chapters: MockRepo;
  let conversations: MockRepo;
  let messages: MockRepo;
  let users: MockRepo;
  let subjects: MockRepo;
  let classes: MockRepo;
  let tutor: { answer: jest.Mock };

  beforeEach(async () => {
    chapters = repo();
    conversations = repo();
    messages = repo();
    users = repo();
    subjects = repo();
    classes = repo();
    tutor = { answer: jest.fn().mockResolvedValue('Une explication adaptee.') };
    const module = await Test.createTestingModule({
      providers: [
        LearningService,
        { provide: getRepositoryToken(Chapter), useValue: chapters },
        {
          provide: getRepositoryToken(TutorConversation),
          useValue: conversations,
        },
        { provide: getRepositoryToken(TutorMessage), useValue: messages },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Subject), useValue: subjects },
        { provide: getRepositoryToken(AcademicClass), useValue: classes },
        { provide: OpenAiTutorService, useValue: tutor },
      ],
    }).compile();
    service = module.get(LearningService);
  });

  it('creates an admin chapter as a draft by default', async () => {
    subjects.findOne.mockResolvedValue(subject);
    chapters.count.mockResolvedValue(2);
    const result = await service.createChapter({
      subjectId: subject.id,
      title: ' Fractions ',
      summary: ' Resume ',
      content: ' Cours ',
    });
    expect(result).toMatchObject({
      title: 'Fractions',
      position: 2,
      status: ChapterStatus.DRAFT,
    });
  });

  it('returns only published chapters requested for the student class', async () => {
    users.findOne.mockResolvedValue({ id: 'student-1', classId: 'class-1' });
    classes.findOne.mockResolvedValue({ id: 'class-1', name: '9e annee' });
    subjects.find.mockResolvedValue([subject]);
    chapters.find.mockResolvedValue([publishedChapter]);
    const curriculum = await service.getCurriculum('student-1');
    expect(JSON.stringify(chapters.find.mock.calls)).toContain('published');
    expect(curriculum.subjects[0].chapters).toHaveLength(1);
  });

  it('rejects a chapter from another class', async () => {
    users.findOne.mockResolvedValue({ id: 'student-1', classId: 'class-2' });
    chapters.findOne.mockResolvedValue(publishedChapter);
    await expect(
      service.getStudentChapter('student-1', publishedChapter.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('isolates conversation history by student, chapter and language', async () => {
    users.findOne.mockResolvedValue({ id: 'student-1', classId: 'class-1' });
    chapters.findOne.mockResolvedValue(publishedChapter);
    conversations.findOne.mockResolvedValue({ id: 'conversation-1' });
    messages.find.mockResolvedValue([]);
    await service.getConversation(
      'student-1',
      publishedChapter.id,
      TutorLanguage.CREOLE,
    );
    expect(conversations.findOne).toHaveBeenCalledWith({
      where: {
        userId: 'student-1',
        chapterId: publishedChapter.id,
        language: TutorLanguage.CREOLE,
      },
    });
  });

  it('persists both messages only after the tutor answers', async () => {
    users.findOne.mockResolvedValue({
      id: 'student-1',
      classId: 'class-1',
      role: UserRole.STUDENT,
    });
    chapters.findOne.mockResolvedValue(publishedChapter);
    conversations.findOne.mockResolvedValue({
      id: 'conversation-1',
      userId: 'student-1',
      chapterId: publishedChapter.id,
      language: TutorLanguage.FRENCH,
    });
    messages.find.mockResolvedValue([]);
    await service.sendTutorMessage('student-1', publishedChapter.id, {
      language: TutorLanguage.FRENCH,
      message: 'Explique.',
    });
    expect(tutor.answer).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Explique.', history: [] }),
    );
    expect(messages.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ content: 'Explique.' }),
        expect.objectContaining({ content: 'Une explication adaptee.' }),
      ]),
    );
  });
});

describe('OpenAiTutorService', () => {
  it('fails clearly when OpenAI configuration is missing', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new OpenAiTutorService(config);
    await expect(
      service.answer({
        className: '9e',
        subjectName: 'Maths',
        chapter: publishedChapter,
        language: TutorLanguage.FRENCH,
        history: [],
        question: 'Bonjour',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
