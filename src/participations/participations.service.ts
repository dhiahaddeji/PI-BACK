import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Participation } from './participation.schema';
import { Activity } from '../activity/activity.schema';

@Injectable()
export class ParticipationsService {
  constructor(
    @InjectModel(Participation.name) private model: Model<Participation>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
  ) {}

  upsert(dto: Partial<Participation>) {
    return this.model.findOneAndUpdate(
      { activityId: dto.activityId, employeeId: dto.employeeId },
      { ...dto },
      { upsert: true, returnDocument: 'after' },
    );
  }

  async listForEmployee(employeeId: string) {
    const participations = await this.model
      .find({ employeeId })
      .sort({ createdAt: -1 })
      .lean();

    const activityIds = participations
      .map((p: any) => p.activityId)
      .filter(Boolean);

    if (!activityIds.length) return participations;

    const activities = await this.activityModel
      .find({ _id: { $in: activityIds } })
      .select('title date startDate endDate location type')
      .lean();

    const activityMap = new Map(
      activities.map((a: any) => [String(a._id), a]),
    );

    return participations.map((p: any) => ({
      ...p,
      activity: activityMap.get(String(p.activityId)) || null,
    }));
  }
}
