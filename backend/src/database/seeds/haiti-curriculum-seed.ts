import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import dataSource from '../data-source';
import {
  AcademicClass,
  Difficulty,
  OptionChoice,
  Question,
  Subject,
} from '../../mvp/entities';

loadEnv({ path: '.env', quiet: true });

type OptionSet = { A: string; B: string; C: string; D: string };
type GeneratedQuestion = {
  prompt: string;
  options: OptionSet;
  correctOption: OptionChoice;
  difficulty: Difficulty;
  explanation: string;
};
type ClassProfile = {
  name: string;
  aliases: string[];
  stage: 'fondamental-1' | 'fondamental-2' | 'fondamental-3' | 'secondaire';
  grade: number;
  subjects: string[];
};

type SubjectTopicMap = Record<string, string[]>;

const QUESTIONS_PER_SUBJECT = Number(process.env.SEED_QUESTIONS_PER_SUBJECT ?? 100);
const DRY_RUN = process.argv.includes('--dry-run') || process.env.SEED_DRY_RUN === 'true';

const CLASS_PROFILES: ClassProfile[] = [
  { name: '1ere annee fondamentale', aliases: ['1ere', '1ere annee', '1ere AF', 'premiere annee fondamentale'], stage: 'fondamental-1', grade: 1, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Education artistique', 'Education physique'] },
  { name: '2e annee fondamentale', aliases: ['2e', '2eme', '2e AF', 'deuxieme annee fondamentale'], stage: 'fondamental-1', grade: 2, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Education artistique', 'Education physique'] },
  { name: '3e annee fondamentale', aliases: ['3e', '3eme', '3e AF', 'troisieme annee fondamentale'], stage: 'fondamental-2', grade: 3, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Education artistique', 'Education physique'] },
  { name: '4e annee fondamentale', aliases: ['4e', '4eme', '4e AF', 'quatrieme annee fondamentale'], stage: 'fondamental-2', grade: 4, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Education artistique', 'Education physique'] },
  { name: '5e annee fondamentale', aliases: ['5e', '5eme', '5e AF', 'cinquieme annee fondamentale'], stage: 'fondamental-2', grade: 5, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Anglais', 'Education artistique', 'Education physique'] },
  { name: '6e annee fondamentale', aliases: ['6e', '6eme', '6e AF', 'sixieme annee fondamentale'], stage: 'fondamental-2', grade: 6, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Anglais', 'Education artistique', 'Education physique'] },
  { name: '7e annee fondamentale', aliases: ['7e', '7eme', '7e AF', 'septieme annee fondamentale'], stage: 'fondamental-3', grade: 7, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Anglais', 'Espagnol', 'Informatique'] },
  { name: '8e annee fondamentale', aliases: ['8e', '8eme', '8e AF', 'huitieme annee fondamentale'], stage: 'fondamental-3', grade: 8, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Anglais', 'Espagnol', 'Informatique'] },
  { name: '9e annee fondamentale', aliases: ['9e', '9eme', '9e AF', 'neuvieme annee fondamentale'], stage: 'fondamental-3', grade: 9, subjects: ['Creole', 'Francais', 'Mathematiques', 'Sciences experimentales', 'Sciences sociales', 'Anglais', 'Espagnol', 'Informatique'] },
  { name: 'Secondaire I', aliases: ['S1', 'secondaire 1', 'secondaire I', 'nouveau secondaire 1', 'NS1'], stage: 'secondaire', grade: 10, subjects: ['Francais', 'Mathematiques', 'Physique', 'Chimie', 'Biologie', 'Histoire-Geographie', 'Anglais', 'Espagnol', 'Informatique'] },
  { name: 'Secondaire II', aliases: ['S2', 'secondaire 2', 'secondaire II', 'nouveau secondaire 2', 'NS2'], stage: 'secondaire', grade: 11, subjects: ['Francais', 'Mathematiques', 'Physique', 'Chimie', 'Biologie', 'Histoire-Geographie', 'Anglais', 'Espagnol', 'Informatique'] },
  { name: 'Secondaire III', aliases: ['S3', 'secondaire 3', 'secondaire III', 'nouveau secondaire 3', 'NS3'], stage: 'secondaire', grade: 12, subjects: ['Francais', 'Mathematiques', 'Physique', 'Chimie', 'Biologie', 'Histoire-Geographie', 'Anglais', 'Espagnol', 'Informatique', 'Economie'] },
  { name: 'Secondaire IV', aliases: ['S4', 'secondaire 4', 'secondaire IV', 'philo', 'NS4'], stage: 'secondaire', grade: 13, subjects: ['Francais', 'Mathematiques', 'Physique', 'Chimie', 'Biologie', 'Histoire-Geographie', 'Anglais', 'Espagnol', 'Philosophie', 'Informatique', 'Economie'] },
];

const TOPICS: SubjectTopicMap = {
  Creole: ['lecture expressive', 'comprehension de texte', 'vocabulaire', 'phrase simple', 'production orale', 'production ecrite', 'proverbes', 'orthographe', 'resume', 'communication'],
  Francais: ['lecture', 'grammaire', 'conjugaison', 'orthographe', 'vocabulaire', 'production ecrite', 'comprehension', 'types de phrases', 'accords', 'argumentation'],
  Mathematiques: ['nombres', 'operations', 'fractions', 'mesures', 'geometrie', 'proportionnalite', 'equations', 'statistiques', 'fonctions', 'problemes'],
  'Sciences experimentales': ['etre vivant', 'corps humain', 'matiere', 'energie', 'eau', 'air', 'environnement', 'sante', 'observation', 'experience'],
  'Sciences sociales': ['famille', 'communaute', 'commune', 'departement', 'Haiti', 'citoyennete', 'droits et devoirs', 'histoire nationale', 'geographie', 'patrimoine'],
  'Education artistique': ['couleurs', 'rythme', 'dessin', 'chant', 'artisanat', 'observation', 'motifs', 'expression corporelle', 'creation', 'patrimoine culturel'],
  'Education physique': ['echauffement', 'coordination', 'endurance', 'hygiene', 'jeux collectifs', 'securite', 'posture', 'respiration', 'fair-play', 'motricite'],
  Anglais: ['greetings', 'family', 'school objects', 'numbers', 'colors', 'simple present', 'daily routine', 'reading', 'questions', 'vocabulary'],
  Espagnol: ['saludos', 'familia', 'numeros', 'colores', 'escuela', 'presente', 'descripcion', 'lectura', 'preguntas', 'vocabulario'],
  Informatique: ['materiel', 'logiciel', 'clavier', 'fichier', 'internet', 'securite numerique', 'traitement de texte', 'donnees', 'algorithme', 'citoyennete numerique'],
  Physique: ['mouvement', 'force', 'energie', 'electricite', 'pression', 'optique', 'chaleur', 'mesure', 'ondes', 'securite au laboratoire'],
  Chimie: ['matiere', 'melanges', 'solutions', 'atomes', 'molecules', 'reactions', 'acides et bases', 'conservation', 'laboratoire', 'environnement'],
  Biologie: ['cellule', 'nutrition', 'respiration', 'reproduction', 'systeme nerveux', 'genetique', 'ecosysteme', 'sante', 'microorganismes', 'biodiversite'],
  'Histoire-Geographie': ['territoire haitien', 'relief', 'climat', 'population', 'independance', 'revolution haitienne', 'institutions', 'cartographie', 'Caraibes', 'developpement durable'],
  Economie: ['besoins', 'biens et services', 'production', 'consommation', 'marche', 'budget', 'epargne', 'entreprise', 'monnaie', 'developpement'],
  Philosophie: ['liberte', 'conscience', 'verite', 'morale', 'justice', 'raison', 'culture', 'science', 'devoir', 'argumentation'],
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function difficultyFor(index: number): Difficulty {
  if (index % 10 >= 7) return Difficulty.HARD;
  if (index % 10 >= 3) return Difficulty.MEDIUM;
  return Difficulty.EASY;
}

function promptPrefix(profile: ClassProfile, index: number): string {
  return `[${profile.name} - Q${index + 1}]`;
}

function cleanGeneratedPrompt(prompt: string): string {
  return prompt
    .replace(/^\s*(?:\[[^\]]+\s+-\s+Q\d+\]\s*)+/i, '')
    .replace(/^\s*(?:\[(?=[^\]]*(?:annee|année|fondamentale|secondaire|\bAF\b|\bNS\d?\b|\bS\d\b))[^\]]+\]\s*)+/i, '')
    .trim();
}
function optionsFor(correct: string, wrong: string[], index: number): { options: OptionSet; correctOption: OptionChoice } {
  const keys = [OptionChoice.A, OptionChoice.B, OptionChoice.C, OptionChoice.D];
  const correctKey = keys[index % keys.length];
  const values: Record<OptionChoice, string> = { A: '', B: '', C: '', D: '' };
  values[correctKey] = correct;
  let wrongIndex = 0;
  for (const key of keys) {
    if (!values[key]) {
      values[key] = wrong[wrongIndex] ?? 'Aucune de ces reponses';
      wrongIndex += 1;
    }
  }
  return { options: values, correctOption: correctKey };
}

function mathQuestion(profile: ClassProfile, index: number): GeneratedQuestion {
  const base = profile.grade + index + 3;
  const mode = index % 5;
  if (mode === 0) {
    const a = base;
    const b = profile.grade + (index % 9) + 2;
    const answer = a + b;
    const { options, correctOption } = optionsFor(String(answer), [String(answer + 1), String(answer - 1), String(a * b)], index);
    return { prompt: `${promptPrefix(profile, index)} Calcule ${a} + ${b}.`, options, correctOption, difficulty: difficultyFor(index), explanation: `On additionne ${a} et ${b}; le resultat est ${answer}.` };
  }
  if (mode === 1) {
    const a = base + 8;
    const b = (index % 7) + 2;
    const answer = a - b;
    const { options, correctOption } = optionsFor(String(answer), [String(answer + b), String(answer + 2), String(answer - 2)], index);
    return { prompt: `${promptPrefix(profile, index)} Calcule ${a} - ${b}.`, options, correctOption, difficulty: difficultyFor(index), explanation: `On retire ${b} de ${a}; il reste ${answer}.` };
  }
  if (mode === 2) {
    const a = (profile.grade % 5) + 2;
    const b = (index % 8) + 2;
    const answer = a * b;
    const { options, correctOption } = optionsFor(String(answer), [String(answer + a), String(answer - b), String(a + b)], index);
    return { prompt: `${promptPrefix(profile, index)} Quel est le produit de ${a} par ${b} ?`, options, correctOption, difficulty: difficultyFor(index), explanation: `${a} x ${b} = ${answer}.` };
  }
  if (mode === 3) {
    const denominator = (index % 8) + 2;
    const { options, correctOption } = optionsFor(`1/${denominator}`, [`${denominator}/1`, `1/${denominator + 1}`, `2/${denominator}`], index);
    return { prompt: `${promptPrefix(profile, index)} On partage une unite en ${denominator} parts egales et on prend une part. Quelle fraction represente cette situation ?`, options, correctOption, difficulty: difficultyFor(index), explanation: `Une part sur ${denominator} parts egales s'ecrit 1/${denominator}.` };
  }
  const side = (index % 9) + 2;
  const answer = side * 4;
  const { options, correctOption } = optionsFor(`${answer} unites`, [`${side * side} unites`, `${side + 4} unites`, `${answer + 2} unites`], index);
  return { prompt: `${promptPrefix(profile, index)} Quel est le perimetre d'un carre de cote ${side} unites ?`, options, correctOption, difficulty: difficultyFor(index), explanation: `Le perimetre du carre est 4 x cote, donc 4 x ${side} = ${answer}.` };
}

function languageQuestion(profile: ClassProfile, subject: string, topic: string, index: number): GeneratedQuestion {
  const samples = ['Le soleil brille sur la cour.', 'Les eleves lisent un texte.', 'Marie prepare son cahier.', 'Nous respectons la classe.'];
  const sentence = samples[index % samples.length];
  const correct = index % 2 === 0 ? 'Le verbe exprime une action ou un etat.' : 'Lire le texte puis reperer les indices importants.';
  const { options, correctOption } = optionsFor(correct, ['Ignorer le contexte de la phrase.', 'Choisir une reponse sans lire.', 'Confondre tous les mots de la phrase.'], index);
  return { prompt: `${promptPrefix(profile, index)} En ${subject}, pour le theme ${topic}, quelle demarche aide a comprendre la phrase: "${sentence}" ?`, options, correctOption, difficulty: difficultyFor(index), explanation: `La question travaille ${topic}: il faut lire, identifier les mots utiles et justifier la reponse.` };
}

function scienceQuestion(profile: ClassProfile, subject: string, topic: string, index: number): GeneratedQuestion {
  const correctByTopic: Record<string, string> = {
    'corps humain': 'Observer les organes et expliquer leur role.',
    sante: 'Adopter des pratiques qui protegent le corps.',
    environnement: 'Identifier les actions qui protegent le milieu.',
    energie: 'Reconnaitre une source et une transformation d energie.',
    cellule: 'Comprendre que la cellule est une unite du vivant.',
    electricite: 'Respecter les regles de securite avant toute manipulation.',
  };
  const correct = correctByTopic[topic] ?? `Observer, comparer et expliquer le phenomene lie a ${topic}.`;
  const { options, correctOption } = optionsFor(correct, ['Memoriser un mot sans experience ni exemple.', 'Melanger les observations et les opinions.', 'Repondre sans tenir compte des donnees.'], index);
  return { prompt: `${promptPrefix(profile, index)} En ${subject}, quelle affirmation correspond le mieux au theme ${topic} ?`, options, correctOption, difficulty: difficultyFor(index), explanation: `Cette question verifie la comprehension du theme ${topic} selon une demarche d'observation et d'explication.` };
}

function socialQuestion(profile: ClassProfile, subject: string, topic: string, index: number): GeneratedQuestion {
  const correct = topic.includes('citoy') || topic.includes('droits') ? 'Respecter les regles communes et participer a la vie de la communaute.' : `Situer et expliquer un fait lie a ${topic}.`;
  const { options, correctOption } = optionsFor(correct, ['Confondre les lieux, les dates et les acteurs.', 'Retenir seulement un mot sans contexte.', 'Ignorer les documents et les cartes.'], index);
  return { prompt: `${promptPrefix(profile, index)} En ${subject}, quelle reponse montre une bonne comprehension du theme ${topic} ?`, options, correctOption, difficulty: difficultyFor(index), explanation: `Le theme ${topic} demande de situer, expliquer et relier les faits a la realite haitienne.` };
}

function modernLanguageQuestion(profile: ClassProfile, subject: string, topic: string, index: number): GeneratedQuestion {
  const greetings = subject === 'Anglais' ? { prompt: 'How are you?', correct: 'I am fine, thank you.' } : { prompt: 'Como estas?', correct: 'Estoy bien, gracias.' };
  const { options, correctOption } = optionsFor(greetings.correct, ['Good night, book.', 'Two red classroom.', 'My pencil is yesterday.'], index);
  return { prompt: `${promptPrefix(profile, index)} En ${subject}, choisis la reponse correcte a: "${greetings.prompt}" (${topic}).`, options, correctOption, difficulty: difficultyFor(index), explanation: `La reponse correcte respecte le vocabulaire et la situation de communication: ${topic}.` };
}

function generalQuestion(profile: ClassProfile, subject: string, topic: string, index: number): GeneratedQuestion {
  const correct = `Analyser une situation simple liee a ${topic}, puis justifier la reponse.`;
  const { options, correctOption } = optionsFor(correct, ['Repeter le titre sans exemple.', 'Choisir au hasard.', 'Changer de theme sans raison.'], index);
  return { prompt: `${promptPrefix(profile, index)} En ${subject}, quelle demarche correspond au theme ${topic} ?`, options, correctOption, difficulty: difficultyFor(index), explanation: `Cette question est rattachee au theme ${topic} et demande une justification courte.` };
}

function generateQuestion(profile: ClassProfile, subject: string, index: number): GeneratedQuestion {
  const topics = TOPICS[subject] ?? ['notions de base', 'application', 'analyse', 'communication'];
  const topic = topics[index % topics.length];
  const normalizedSubject = normalize(subject);
  if (normalizedSubject.includes('mathematique')) return mathQuestion(profile, index);
  if (['francais', 'creole'].includes(normalizedSubject)) return languageQuestion(profile, subject, topic, index);
  if (['anglais', 'espagnol'].includes(normalizedSubject)) return modernLanguageQuestion(profile, subject, topic, index);
  if (['scienceexperimentales', 'physique', 'chimie', 'biologie'].includes(normalizedSubject)) return scienceQuestion(profile, subject, topic, index);
  if (['sciencessociales', 'histoiregeographie'].includes(normalizedSubject)) return socialQuestion(profile, subject, topic, index);
  return generalQuestion(profile, subject, topic, index);
}

function findProfileForClass(className: string): ClassProfile | undefined {
  const normalizedName = normalize(className);
  return CLASS_PROFILES.find((profile) => [profile.name, ...profile.aliases].some((name) => normalize(name) === normalizedName));
}

async function ensureClass(classRepo: ReturnType<typeof dataSource.getRepository<AcademicClass>>, profile: ClassProfile) {
  const classes = await classRepo.find();
  const existing = classes.find((item) => findProfileForClass(item.name)?.name === profile.name);
  if (existing) return existing;
  const created = classRepo.create({ name: profile.name });
  if (!DRY_RUN) return classRepo.save(created);
  return { ...created, id: `dry-${normalize(profile.name)}` } as AcademicClass;
}

async function ensureSubject(subjectRepo: ReturnType<typeof dataSource.getRepository<Subject>>, classId: string, name: string) {
  const existing = await subjectRepo.findOne({ where: { classId, name } });
  if (existing) return existing;
  const created = subjectRepo.create({ classId, name });
  if (!DRY_RUN) return subjectRepo.save(created);
  return { ...created, id: `dry-${classId}-${normalize(name)}` } as Subject;
}

async function seed() {
  await dataSource.initialize();
  try {
    const classRepo = dataSource.getRepository(AcademicClass);
    const subjectRepo = dataSource.getRepository(Subject);
    const questionRepo = dataSource.getRepository(Question);
    const summary: string[] = [];

    for (const profile of CLASS_PROFILES) {
      const academicClass = await ensureClass(classRepo, profile);
      for (const subjectName of profile.subjects) {
        const subject = await ensureSubject(subjectRepo, academicClass.id, subjectName);
        const existingQuestions = await questionRepo.find({ where: { classId: academicClass.id, subjectId: subject.id }, select: { id: true, prompt: true } });
        const questionsToClean = existingQuestions
          .map((question) => ({ question, prompt: cleanGeneratedPrompt(question.prompt) }))
          .filter((item) => item.prompt !== item.question.prompt);
        if (!DRY_RUN) {
          for (const item of questionsToClean) {
            await questionRepo.update(item.question.id, { prompt: item.prompt });
            item.question.prompt = item.prompt;
          }
        }
        const existingPrompts = new Set(existingQuestions.map((question) => cleanGeneratedPrompt(question.prompt)));
        const toCreate: Question[] = [];

        for (let index = 0; existingQuestions.length + toCreate.length < QUESTIONS_PER_SUBJECT && index < QUESTIONS_PER_SUBJECT * 3; index += 1) {
          const generated = generateQuestion(profile, subjectName, index);
          generated.prompt = cleanGeneratedPrompt(generated.prompt);
          if (existingPrompts.has(generated.prompt)) continue;
          existingPrompts.add(generated.prompt);
          toCreate.push(questionRepo.create({ classId: academicClass.id, subjectId: subject.id, prompt: generated.prompt, optionA: generated.options.A, optionB: generated.options.B, optionC: generated.options.C, optionD: generated.options.D, correctOption: generated.correctOption, difficulty: generated.difficulty, explanation: generated.explanation }));
        }

        if (!DRY_RUN && toCreate.length > 0) await questionRepo.save(toCreate, { chunk: 100 });
        summary.push(`${profile.name} / ${subjectName}: ${existingQuestions.length} existantes, ${questionsToClean.length} nettoyees, ${toCreate.length} ajoutees${DRY_RUN ? ' (dry-run)' : ''}`);
      }
    }

    console.log(summary.join('\n'));
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});