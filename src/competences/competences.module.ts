import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Competence, CompetenceSchema } from './competence.schema';
import { FicheCompetence, FicheCompetenceSchema } from './fiche-competence.schema';
import { QuestionCompetence, QuestionCompetenceSchema } from './question-competence.schema';
import { CompetencesService } from './competences.service';
import { CompetencesController } from './competences.controller';
import { CompetencesSeeder } from './competences.seeder';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Competence.name,         schema: CompetenceSchema },
      { name: FicheCompetence.name,    schema: FicheCompetenceSchema },
      { name: QuestionCompetence.name, schema: QuestionCompetenceSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [CompetencesController],
  providers: [CompetencesService, CompetencesSeeder],
  exports: [CompetencesService],
})
export class CompetencesModule {}
