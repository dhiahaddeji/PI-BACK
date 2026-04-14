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

  async listPaginated(page?: number, limit?: number) {
    const safeLimit = Math.min(limit ?? 20, 200);
    const safePage = Math.max(page ?? 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.model.find().sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      this.model.countDocuments(),
    ]);

    return { data, total, page: safePage, limit: safeLimit };
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  update(id: string, dto: Partial<Activity>) {
    return this.model.findByIdAndUpdate(id, dto, { new: true });
  }
}
