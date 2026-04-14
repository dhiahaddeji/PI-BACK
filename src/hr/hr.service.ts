import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HR } from './schemas/hr.schema';

@Injectable()
export class HrService {
  constructor(@InjectModel(HR.name) private hrModel: Model<HR>) {}

  async create(userId: string) {
    return this.hrModel.create({ user_id: userId });
  }
}
