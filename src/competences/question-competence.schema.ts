import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type QuestionCompetenceDocument = HydratedDocument<QuestionCompetence>;

export type CompetenceType = 'savoir' | 'savoir_faire' | 'savoir_etre';

/** Catalogue des compétences — créées par HR */
@Schema({ timestamps: true, collection: 'question_competences' })
export class QuestionCompetence {
  @Prop({ required: true })
  intitule: string; // Ex: "Python", "Communication", "Gestion de projet"

  @Prop({ required: true, enum: ['savoir', 'savoir_faire', 'savoir_etre'] })
  type: CompetenceType;

  @Prop()
  description: string;

  @Prop({ default: true })
  actif: boolean;
}

export const QuestionCompetenceSchema = SchemaFactory.createForClass(QuestionCompetence);
