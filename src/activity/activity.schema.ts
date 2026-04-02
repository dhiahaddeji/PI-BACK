import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

/** Compétence requise pour une activité */
export interface CompetenceRequise {
  intitule: string;       // nom de la compétence
  type: string;           // savoir | savoir_faire | savoir_etre
  niveau_min: number;     // niveau minimum requis (0–4)
}

@Schema({ timestamps: true, collection: 'activities' })
export class Activity {
  @Prop({ required: true }) title: string;
  @Prop() description?: string;
  @Prop() date?: string;
  @Prop() location?: string;
  @Prop() duration?: string; // ex: "2 jours"

  @Prop({ default: 0 }) seats: number;

  // Type d'activité
  @Prop({ default: 'formation', enum: ['formation', 'certification', 'projet', 'mission', 'audit'] })
  type: string;

  // Contexte de priorisation IA
  @Prop({ default: 'expertise', enum: ['upskilling', 'consolidation', 'expertise'] })
  prioritization: string;

  @Prop({ required: true }) managerId: string;
  @Prop({ required: true }) createdBy: string;

  @Prop({
    default: 'DRAFT',
    enum: ['DRAFT', 'AI_SUGGESTED', 'HR_VALIDATED', 'SENT_TO_MANAGER', 'MANAGER_CONFIRMED', 'NOTIFIED'],
  })
  status: string;

  @Prop({ type: [String], default: [] })
  participants: string[];

  /**
   * Compétences requises pour cette activité — utilisées par l'IA pour le matching
   * Chaque item: { intitule, type, niveau_min (0-4) }
   */
  @Prop({ type: [Object], default: [] })
  competences_requises: CompetenceRequise[];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
