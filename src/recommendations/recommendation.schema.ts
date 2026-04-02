import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecommendationDocument = HydratedDocument<Recommendation>;

@Schema({ timestamps: true })
export class Recommendation {
  @Prop({ required: true, index: true }) activityId: string;

  /**
   * Liste enrichie par le vrai matching IA:
   * { employeeId, employeeName, score (0-100%), rank, details[], totalCompetences, meetsAll, meetsCount }
   */
  @Prop({ type: [Object], default: [] })
  list: any[];

  @Prop({ default: false }) hrValidated: boolean;
}

export const RecommendationSchema = SchemaFactory.createForClass(Recommendation);
