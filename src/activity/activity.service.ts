import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Activity } from './activity.schema';

@Injectable()
export class ActivitiesService {
  constructor(@InjectModel(Activity.name) private model: Model<Activity>) {}

  create(dto: Partial<Activity>) {
    return this.model.create(dto);
  }

  findAll() {
    return this.model.find().sort({ createdAt: -1 });
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  update(id: string, dto: Partial<Activity>) {
    return this.model.findByIdAndUpdate(id, dto, { new: true });
  }
}
