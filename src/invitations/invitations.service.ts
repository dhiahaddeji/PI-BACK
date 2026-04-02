import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invitation } from './invitation.schema';

@Injectable()
export class InvitationsService {
  constructor(@InjectModel(Invitation.name) private model: Model<Invitation>) {}

  bulkCreate(activityId: string, employeeIds: string[]) {
    const docs = employeeIds.map((employeeId) => ({
      activityId,
      employeeId,
      status: 'PENDING',
      justification: '',
    }));
    return this.model.insertMany(docs, { ordered: false });
  }

  /** Recrée proprement les invitations PENDING (supprime les anciennes PENDING d'abord) */
  async bulkUpsert(activityId: string, employeeIds: string[]) {
    await this.model.deleteMany({ activityId, status: 'PENDING' });
    if (!employeeIds.length) return [];
    const docs = employeeIds.map((employeeId) => ({
      activityId, employeeId, status: 'PENDING', justification: '',
    }));
    return this.model.insertMany(docs, { ordered: false });
  }

  listForEmployee(employeeId: string) {
    return this.model.find({ employeeId }).sort({ createdAt: -1 });
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  respond(id: string, status: 'ACCEPTED' | 'DECLINED', justification?: string) {
    return this.model.findByIdAndUpdate(
      id,
      {
        status,
        justification: status === 'DECLINED' ? justification || '' : '',
      },
      { new: true },
    );
  }

  listByActivity(activityId: string) {
    return this.model.find({ activityId });
  }
}
