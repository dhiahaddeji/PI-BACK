import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CompetenceDocument = HydratedDocument<Competence>;

/**
 * Score d'évaluation (0–4) :
 *  0 = Pas de compétence
 *  1 = Notions de base
 *  2 = Pratique autonome
 *  3 = Maîtrise
 *  4 = Expert
 */
export const EVAL_TO_SCORE: Record<number, number> = {
  0: 0, 1: 25, 2: 50, 3: 75, 4: 100,
};

/** Un enregistrement de compétence dans une fiche */
@Schema({ timestamps: true, collection: 'competences' })
export class Competence {
  @Prop({ required: true })
  fiche_id: string; // ref → FicheCompetence._id

  @Prop()
  question_competence_id: string; // ref → QuestionCompetence._id (optional)

  @Prop({ required: true, enum: ['savoir', 'savoir_faire', 'savoir_etre'] })
  type: string;

  @Prop({ required: true })
  intitule: string; // titre libre ou du catalogue

  /**
   * Auto-évaluation de l'employé (0–4)
   */
  @Prop({ default: 0, min: 0, max: 4 })
  auto_eval: number;

  /**
   * Évaluation hiérarchique du manager (0–4)
   * -1 = non encore évalué
   */
  @Prop({ default: -1, min: -1, max: 4 })
  hierarchie_eval: number;

  @Prop({ default: 'draft' })
  etat: string; // draft | submitted | validated
}

export const CompetenceSchema = SchemaFactory.createForClass(Competence);

// Index pour retrouver rapidement les compétences d'une fiche
CompetenceSchema.index({ fiche_id: 1 });
CompetenceSchema.index({ intitule: 1 });
