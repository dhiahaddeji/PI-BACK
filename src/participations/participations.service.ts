import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Participation } from './participation.schema';

@Injectable()
export class ParticipationsService {
  constructor(
    @InjectModel(Participation.name) private model: Model<Participation>,
  ) {}

  upsert(dto: Partial<Participation>) {
    return this.model.findOneAndUpdate(
      { activityId: dto.activityId, employeeId: dto.employeeId },
      { ...dto },
      { upsert: true, new: true },
    );
  }

  listForEmployee(employeeId: string) {
    return this.model.find({ employeeId }).sort({ createdAt: -1 });
  }
}
