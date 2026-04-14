import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FicheCompetenceDocument = HydratedDocument<FicheCompetence>;

export type FicheEtat = 'draft' | 'submitted' | 'validated' | 'rejected';

/** Fiche de compétences — une par employé */
@Schema({ timestamps: true, collection: 'fiche_competences' })
export class FicheCompetence {
  @Prop({ required: true, unique: true })
  employee_id: string; // ref → User._id

  @Prop()
  employee_name: string;

  @Prop({ default: 'draft' })
  etat: FicheEtat; // draft → submitted → validated / rejected

  @Prop()
  validated_by: string; // managerId who validated

  @Prop()
  validated_at: Date;

  @Prop()
  rejection_note: string;
}

export const FicheCompetenceSchema = SchemaFactory.createForClass(FicheCompetence);
