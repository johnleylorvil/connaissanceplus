import {
  ForbiddenException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AcademicClass, Subject, User } from '../mvp/entities';
import {
  CreateChapterDto,
  SendTutorMessageDto,
  UpdateChapterDto,
} from './learning.dto';
import {
  Chapter,
  ChapterStatus,
  TutorConversation,
  TutorLanguage,
  TutorMessage,
  TutorMessageRole,
} from './learning.entities';
import { OpenAiTutorService } from './openai-tutor.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(TutorConversation)
    private readonly conversationRepo: Repository<TutorConversation>,
    @InjectRepository(TutorMessage)
    private readonly messageRepo: Repository<TutorMessage>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(AcademicClass)
    private readonly classRepo: Repository<AcademicClass>,
    private readonly openAiTutor: OpenAiTutorService,
    @Optional() private readonly platformSettings?: PlatformSettingsService,
  ) {}

  async listAdminChapters(classId?: string, subjectId?: string) {
    const chapters = await this.chapterRepo.find({
      relations: { subject: { academicClass: true } },
      order: { position: 'ASC', title: 'ASC' },
    });
    return chapters.filter(
      (chapter) =>
        (!classId || chapter.subject.classId === classId) &&
        (!subjectId || chapter.subjectId === subjectId),
    );
  }

  async createChapter(dto: CreateChapterDto) {
    const subject = await this.requireSubject(dto.subjectId);
    const position =
      dto.position ??
      (await this.chapterRepo.count({ where: { subjectId: subject.id } }));
    return this.chapterRepo.save(
      this.chapterRepo.create({
        ...dto,
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        content: dto.content.trim(),
        position,
        status: dto.status ?? ChapterStatus.DRAFT,
      }),
    );
  }

  async updateChapter(id: string, dto: UpdateChapterDto) {
    const chapter = await this.requireAdminChapter(id);
    if (dto.subjectId) await this.requireSubject(dto.subjectId);
    Object.assign(chapter, dto);
    if (dto.title !== undefined) chapter.title = dto.title.trim();
    if (dto.summary !== undefined) chapter.summary = dto.summary.trim();
    if (dto.content !== undefined) chapter.content = dto.content.trim();
    return this.chapterRepo.save(chapter);
  }

  async deleteChapter(id: string) {
    const chapter = await this.requireAdminChapter(id);
    await this.chapterRepo.remove(chapter);
    return { success: true };
  }

  async getCurriculum(userId: string) {
    const user = await this.requireStudent(userId);
    if (!user.classId) return { class: null, subjects: [] };
    const [academicClass, subjects] = await Promise.all([
      this.classRepo.findOne({ where: { id: user.classId } }),
      this.subjectRepo.find({
        where: { classId: user.classId },
        order: { name: 'ASC' },
      }),
    ]);
    const subjectIds = subjects.map((subject) => subject.id);
    const chapters =
      subjectIds.length === 0
        ? []
        : await this.chapterRepo.find({
            where: {
              subjectId: In(subjectIds),
              status: ChapterStatus.PUBLISHED,
            },
            order: { position: 'ASC', title: 'ASC' },
          });
    return {
      class: academicClass
        ? { id: academicClass.id, name: academicClass.name }
        : null,
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        chapters: chapters
          .filter((chapter) => chapter.subjectId === subject.id)
          .map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            summary: chapter.summary,
            position: chapter.position,
            updatedAt: chapter.updatedAt,
          })),
      })),
    };
  }

  async getStudentChapter(userId: string, chapterId: string) {
    const { chapter, subject } = await this.requireStudentChapter(
      userId,
      chapterId,
    );
    return {
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      content: chapter.content,
      position: chapter.position,
      updatedAt: chapter.updatedAt,
      subject: { id: subject.id, name: subject.name },
    };
  }

  async getConversation(
    userId: string,
    chapterId: string,
    language: TutorLanguage,
  ) {
    await this.requireStudentChapter(userId, chapterId);
    const conversation = await this.conversationRepo.findOne({
      where: { userId, chapterId, language },
    });
    if (!conversation) return { id: null, chapterId, language, messages: [] };
    const messages = await this.messageRepo.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });
    return { id: conversation.id, chapterId, language, messages };
  }

  async sendTutorMessage(
    userId: string,
    chapterId: string,
    dto: SendTutorMessageDto,
  ) {
    if (this.platformSettings && !this.platformSettings.get().tutorEnabled) {
      throw new ServiceUnavailableException('Le tuteur pédagogique est temporairement désactivé.');
    }
    const { chapter, subject, academicClass } =
      await this.requireStudentChapter(userId, chapterId);
    let conversation = await this.conversationRepo.findOne({
      where: { userId, chapterId, language: dto.language },
    });
    if (!conversation) {
      conversation = await this.conversationRepo.save(
        this.conversationRepo.create({
          userId,
          chapterId,
          language: dto.language,
        }),
      );
    }
    const recent = await this.messageRepo.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const question = dto.message.trim();
    const answer = await this.openAiTutor.answer({
      className: academicClass.name,
      subjectName: subject.name,
      chapter,
      language: dto.language,
      history: recent.reverse(),
      question,
    });
    const [userMessage, assistantMessage] = await this.messageRepo.save([
      this.messageRepo.create({
        conversationId: conversation.id,
        role: TutorMessageRole.USER,
        content: question,
      }),
      this.messageRepo.create({
        conversationId: conversation.id,
        role: TutorMessageRole.ASSISTANT,
        content: answer,
      }),
    ]);
    conversation.updatedAt = new Date();
    await this.conversationRepo.save(conversation);
    return {
      conversationId: conversation.id,
      messages: [userMessage, assistantMessage],
    };
  }

  private async requireSubject(subjectId: string) {
    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId },
    });
    if (!subject) throw new NotFoundException('Matiere introuvable.');
    return subject;
  }

  private async requireAdminChapter(id: string) {
    const chapter = await this.chapterRepo.findOne({ where: { id } });
    if (!chapter) throw new NotFoundException('Chapitre introuvable.');
    return chapter;
  }

  private async requireStudent(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Etudiant introuvable.');
    return user;
  }

  private async requireStudentChapter(userId: string, chapterId: string) {
    const [user, chapter] = await Promise.all([
      this.requireStudent(userId),
      this.chapterRepo.findOne({
        where: { id: chapterId, status: ChapterStatus.PUBLISHED },
        relations: { subject: { academicClass: true } },
      }),
    ]);
    if (!chapter)
      throw new NotFoundException('Chapitre introuvable ou non publie.');
    if (!user.classId || chapter.subject.classId !== user.classId) {
      throw new ForbiddenException(
        "Ce chapitre n'appartient pas a votre classe.",
      );
    }
    return {
      chapter,
      subject: chapter.subject,
      academicClass: chapter.subject.academicClass,
    };
  }
}
