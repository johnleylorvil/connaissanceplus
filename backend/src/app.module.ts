import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { extname, join } from 'path';
import { MvpModule } from './mvp/mvp.module';
import { ArenaModule } from './arena/arena.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { CorrespondenceModule } from './correspondence/correspondence.module';
import { createTypeOrmOptions } from './database/typeorm.config';
import { StudentInsightsModule } from './student-insights/student-insights.module';
import { LearningModule } from './learning/learning.module';
import { AdminInsightsModule } from './admin-insights/admin-insights.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { FriendshipModule } from './friendship/friendship.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Serve HLS segments written by LiveKit Egress into backend/hls_output.
    // Files in hls_output/{matchId}/ are accessible at /hls/{matchId}/index.m3u8.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'hls_output'),
      serveRoot: '/hls',
      serveStaticOptions: {
        maxAge: 0,
        etag: false,
        setHeaders: (res, filePath) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          const extension = extname(filePath).toLowerCase();
          if (extension === '.m3u8') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            return;
          }

          if (extension === '.ts') {
            res.setHeader('Cache-Control', 'public, max-age=1, must-revalidate');
          }
        },
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        maxAge: '7d',
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => createTypeOrmOptions(configService),
    }),
    PlatformSettingsModule,
    MvpModule,
    ArenaModule,
    SponsorsModule,
    CorrespondenceModule,
    StudentInsightsModule,
    LearningModule,
    AdminInsightsModule,
    FriendshipModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

