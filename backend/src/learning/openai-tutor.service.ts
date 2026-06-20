import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Chapter,
  TutorLanguage,
  TutorMessage,
  TutorMessageRole,
} from './learning.entities';

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

@Injectable()
export class OpenAiTutorService {
  constructor(private readonly configService: ConfigService) {}

  async answer(input: {
    className: string;
    subjectName: string;
    chapter: Chapter;
    language: TutorLanguage;
    history: TutorMessage[];
    question: string;
  }): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    const model = this.configService.get<string>('OPENAI_MODEL')?.trim();
    if (!apiKey || !model) {
      throw new ServiceUnavailableException(
        "Le tuteur IA n'est pas configure pour le moment.",
      );
    }

    const languageInstruction =
      input.language === TutorLanguage.CREOLE
        ? 'Reponn an kreyol ayisyen klè, natirèl, epi adapte ak nivo elèv la.'
        : 'Réponds en français clair, naturel et adapté au niveau de l’élève.';
    const instructions = [
      'Tu es le tuteur pédagogique de Konesans+.',
      languageInstruction,
      `Classe: ${input.className}. Matière: ${input.subjectName}. Chapitre: ${input.chapter.title}.`,
      'Appuie-toi d’abord sur le contenu validé ci-dessous. Si une information dépasse ce contenu, indique-le clairement au lieu de l’inventer.',
      'Explique avec bienveillance, des étapes courtes et des exemples adaptés. Ne demande ni nom, ni adresse, ni donnée personnelle.',
      `Contenu validé du chapitre:\n${input.chapter.content.slice(0, 40000)}`,
    ].join('\n\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          instructions,
          input: [
            ...input.history.map((message) => ({
              role:
                message.role === TutorMessageRole.ASSISTANT
                  ? 'assistant'
                  : 'user',
              content: message.content,
            })),
            { role: 'user', content: input.question },
          ],
          max_output_tokens: 1200,
        }),
        signal: controller.signal,
      });
      const data = (await response.json()) as OpenAIResponse;
      if (!response.ok) {
        throw new Error(
          data.error?.message ?? `OpenAI HTTP ${response.status}`,
        );
      }
      const answer = data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text' && item.text)
        .map((item) => item.text)
        .join('\n')
        .trim();
      if (!answer) throw new Error('OpenAI returned an empty response');
      return answer;
    } catch {
      throw new ServiceUnavailableException(
        'Le tuteur IA est temporairement indisponible. Reessayez dans quelques instants.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
