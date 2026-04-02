import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { NlpService } from './nlp.service';
import { MatchingService } from './matching.service';
import { CompetencesModule } from '../competences/competences.module';

@Module({
  imports: [CompetencesModule],
  controllers: [AiController],
  providers: [AiService, NlpService, MatchingService],
  exports: [NlpService, MatchingService],
})
export class AiModule {}
