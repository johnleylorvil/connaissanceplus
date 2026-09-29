import { PGlite } from '@electric-sql/pglite';
import { DataSource, QueryResult } from 'typeorm';
import type { MvpService } from './mvp.service';

// Execute the real TypeORM queries against PostgreSQL, including its identifier
// case rules. SQLite accepts the unquoted camelCase aliases that broke production.
class LeaderboardDataSource extends DataSource {
  prepareMetadata() {
    return this.buildMetadatas();
  }
}

describe('weekly leaderboard (PostgreSQL)', () => {
  let database: PGlite;
  let service: MvpService;
  const currentWeek = new Date('2026-09-28T05:00:00Z');
  const previousWeek = new Date('2026-09-21T05:00:00Z');

  beforeAll(async () => {
    const previousDbType = process.env.DB_TYPE;
    process.env.DB_TYPE = 'postgres';
    let dataSource: LeaderboardDataSource;
    try {
      const { databaseEntities } = require('../database/entities');
      const { MvpService: Service } = require('./mvp.service');
      const { DuelProgress, QuizSession } = require('./entities');
      dataSource = new LeaderboardDataSource({
        type: 'postgres',
        entities: databaseEntities,
      });
      await dataSource.prepareMetadata();
      // Only these repositories are used by the public leaderboard.
      service = Object.assign(Object.create(Service.prototype), {
        duelProgressRepo: dataSource.getRepository(DuelProgress),
        quizSessionRepo: dataSource.getRepository(QuizSession),
        getStartOfWeek: (weeksAgo = 0) =>
          weeksAgo ? previousWeek : currentWeek,
      });
    } finally {
      if (previousDbType === undefined) delete process.env.DB_TYPE;
      else process.env.DB_TYPE = previousDbType;
    }

    database = new PGlite();
    // Replace only the transport; PostgreSQL parses and executes the generated SQL.
    const createQueryRunner = dataSource.createQueryRunner.bind(dataSource);
    jest.spyOn(dataSource, 'createQueryRunner').mockImplementation(() => {
      const runner = createQueryRunner();
      runner.query = async (sql, parameters, structured) => {
        const result = await database.query(sql, parameters);
        return structured
          ? Object.assign(new QueryResult(), {
              records: result.rows,
              raw: result.rows,
            })
          : result.rows;
      };
      return runner;
    });
    await database.exec(`
      CREATE TABLE users (
        id text PRIMARY KEY, "firstName" text, "lastName" text, "levelId" text,
        "avatarUrl" text
      );
      CREATE TABLE duel_matches (
        id text PRIMARY KEY, "winnerUserId" text, status text, mode text,
        "playerTwoId" text, "completedAt" timestamp
      );
      CREATE TABLE duel_progresses (
        id text PRIMARY KEY, "duelMatchId" text, "userId" text,
        score integer, "totalTimeSeconds" integer
      );
      CREATE TABLE quiz_sessions (
        id text PRIMARY KEY, "userId" text, "levelId" text, status text,
        score integer, "updatedAt" timestamp
      );
    `);
  }, 30000);

  beforeEach(async () => {
    await database.exec(`
      TRUNCATE users, duel_matches, duel_progresses, quiz_sessions;
      INSERT INTO users VALUES
        ('anne', 'Anne', 'Eleve', 'class-a', 'https://example.com/anne.jpg'),
        ('bert', 'Bert', 'Eleve', 'class-b', NULL),
        ('claire', 'Claire', 'Eleve', 'class-a', '/uploads/avatars/claire.jpg');
    `);
  });

  afterAll(async () => {
    await database?.close();
    jest.restoreAllMocks();
  });

  async function addDuel(
    id: string,
    winner: string | null,
    completedAt = '2026-09-29 12:00:00',
    status = 'completed',
    mode = 'qcm',
    playerTwo: string | null = 'bert',
  ) {
    await database.query(
      'INSERT INTO duel_matches VALUES ($1, $2, $3, $4, $5, $6)',
      [id, winner, status, mode, playerTwo, completedAt],
    );
    await database.query(
      'INSERT INTO duel_progresses VALUES ($1, $2, $3, $4, $5), ($6, $2, $7, $8, $9)',
      [`${id}-a`, id, 'anne', 8, 60, `${id}-b`, 'bert', 5, 90],
    );
  }

  async function addQuiz(
    id: string,
    user: string,
    score: number,
    date = '2026-09-29 12:00:00',
    status = 'completed',
  ) {
    await database.query(
      'INSERT INTO quiz_sessions VALUES ($1, $2, $3, $4, $5, $6)',
      [id, user, user === 'bert' ? 'class-b' : 'class-a', status, score, date],
    );
  }

  it('returns an empty list without errors when no results exist', async () => {
    await expect(service.getWeeklyLeaderboard()).resolves.toEqual([]);
  });

  it('ranks completed QCM duels by wins, including the losing student', async () => {
    await addDuel('duel-1', 'anne');
    await addDuel('duel-2', 'anne');
    await addDuel('waiting', null, undefined, 'waiting');
    await addDuel('oral', 'bert', undefined, 'completed', 'oral_live');
    await addDuel('solo', 'bert', undefined, 'completed', 'qcm', null);
    await addQuiz('quiz', 'claire', 10);

    expect(await service.getWeeklyLeaderboard()).toEqual([
      {
        userId: 'anne',
        studentName: 'Anne Eleve',
        avatarUrl: 'https://example.com/anne.jpg',
        winCount: 2,
        lossCount: 0,
        duelCount: 2,
        totalCorrectAnswers: 16,
        winTimeSeconds: 120,
        lastWinAt: expect.anything(),
      },
      {
        userId: 'bert',
        studentName: 'Bert Eleve',
        avatarUrl: null,
        winCount: 0,
        lossCount: 2,
        duelCount: 2,
        totalCorrectAnswers: 10,
        winTimeSeconds: 0,
        lastWinAt: null,
      },
    ]);
    expect(
      (await service.getWeeklyLeaderboard('class-b')).map((row) => row.userId),
    ).toEqual(['bert']);
  });

  it('uses completed quizzes when there are no current duels, ordered by count then score', async () => {
    await addQuiz('a1', 'anne', 3);
    await addQuiz('a2', 'anne', 3);
    await addQuiz('b1', 'bert', 10);
    await addQuiz('c1', 'claire', 4);
    await addQuiz('c2', 'claire', 4);
    await addQuiz('pending', 'bert', 100, undefined, 'in_progress');
    await addDuel('old-duel', 'bert', '2026-09-22 12:00:00');

    const rows = await service.getWeeklyLeaderboard();
    expect(rows.map((row) => row.userId)).toEqual(['claire', 'anne', 'bert']);
    expect(rows.map((row) => row.avatarUrl)).toEqual([
      '/uploads/avatars/claire.jpg',
      'https://example.com/anne.jpg',
      null,
    ]);
    expect(rows[0]).toMatchObject({
      winCount: 2,
      duelCount: 2,
      totalCorrectAnswers: 8,
    });
    expect(
      (await service.getWeeklyLeaderboard('class-a')).map((row) => row.userId),
    ).toEqual(['claire', 'anne']);
  });

  it.each(['2026-09-22 12:00:00', '2026-08-01 12:00:00'])(
    'falls back to older duel results (%s)',
    async (date) => {
      await addDuel('old-duel', 'anne', date);
      expect((await service.getWeeklyLeaderboard())[0].userId).toBe('anne');
    },
  );

  it.each(['2026-09-22 12:00:00', '2026-08-01 12:00:00'])(
    'falls back to older quiz results (%s)',
    async (date) => {
      await addQuiz('old-quiz', 'claire', 7, date);
      expect((await service.getWeeklyLeaderboard())[0].userId).toBe('claire');
    },
  );
});
