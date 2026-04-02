import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Recommendation } from './recommendation.schema';
import { Activity } from '../activity/activity.schema';

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectModel(Recommendation.name)
    private model: Model<Recommendation>,

    // 🔥 AJOUT IMPORTANT
    @InjectModel(Activity.name)
    private activityModel: Model<Activity>,
  ) {}

  /* ---------------- GET ---------------- */
  async getByActivity(activityId: string) {
    return this.model.findOne({ activityId });
  }

  /* ---------------- UPSERT ---------------- */
  async upsert(activityId: string, list: any[], hrValidated = false) {
    return this.model.findOneAndUpdate(
      { activityId },
      { activityId, list, hrValidated },
      { new: true, upsert: true },
    );
  }

  /* ---------------- VALIDATE + SEND 🔥 ---------------- */
  async validate(activityId: string) {
    // 🔹 1. récupérer recommendation
    const recommendation = await this.model.findOne({ activityId });

    if (!recommendation) {
      throw new Error('Recommendation not found');
    }

    // 🔹 2. récupérer activity
    const activity = await this.activityModel.findById(activityId);

    if (!activity) {
      throw new Error('Activity not found');
    }

    // 🔥 3. injecter participants
    activity.participants = (recommendation.list || []).map(
  (item) => item.employeeId,
);

    // 🔥 4. changer statut
    activity.status = 'SENT_TO_MANAGER';

    await activity.save();

    // 🔹 5. valider recommendation
    recommendation.hrValidated = true;
    await recommendation.save();

    return {
      message: 'Recommendation validated and sent to manager',
      activity,
      recommendation,
    };
  }
}