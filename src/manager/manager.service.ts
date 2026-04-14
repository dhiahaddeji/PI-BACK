import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Manager } from './schemas/manager.schema';

@Injectable()
export class ManagerService {
  constructor(
    @InjectModel(Manager.name) private managerModel: Model<Manager>,
  ) {}

  async create(userId: string) {
    return this.managerModel.create({ user_id: userId });
  }
}
