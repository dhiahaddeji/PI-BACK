import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findByEmail(email: string) {
    return this.userModel.findOne({ email });
  }

  async findByGithubId(githubId: string) {
    return this.userModel.findOne({ githubId });
  }

  async findSuperAdmin() {
    return this.userModel.findOne({ role: 'SUPERADMIN' });
  }

  async updateOnlineStatus(userId: string, status: boolean) {
    return this.userModel.findByIdAndUpdate(userId, { en_ligne: status });
  }

  async create(data: any) {
    // Le mot de passe est hashé ici (sauf si déjà hashé)
    const hashed = await bcrypt.hash(data.password, 10);
    const user = new this.userModel({ ...data, password: hashed });
    return user.save();
  }

  async update(id: string, data: any) {
    // Hasher le mot de passe uniquement s'il est fourni en clair
    if (data.password && !data.password.startsWith('$2')) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();

    if (!updated) throw new NotFoundException('Utilisateur introuvable');

    return updated;
  }

  async setRefreshToken(userId: string, refreshToken: string, expiresAt: Date) {
    const hash = await bcrypt.hash(refreshToken, 10);
    return this.userModel.findByIdAndUpdate(userId, {
      refreshTokenHash: hash,
      refreshTokenExpiresAt: expiresAt,
    });
  }

  async clearRefreshToken(userId: string) {
    return this.userModel.findByIdAndUpdate(userId, {
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    });
  }

  async delete(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }

  async findAll() {
    return this.userModel
      .find()
      .select('-password -refreshTokenHash -refreshTokenExpiresAt')
      .exec();
  }

  async listPaginated(filter: Record<string, any>, page?: number, limit?: number) {
    const safeLimit = Math.min(limit ?? 20, 200);
    const safePage = Math.max(page ?? 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password -refreshTokenHash -refreshTokenExpiresAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .exec(),
      this.userModel.countDocuments(filter),
    ]);

    return { data, total, page: safePage, limit: safeLimit };
  }

  async findById(id: string) {
    const user = await this.userModel
      .findById(id)
      .select('-password -refreshTokenHash -refreshTokenExpiresAt')
      .exec();
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async findByIdWithRefreshToken(id: string) {
    const user = await this.userModel
      .findById(id)
      .select(
        'refreshTokenHash refreshTokenExpiresAt name firstName lastName email role status photoUrl mustChangePassword isProfileComplete matricule',
      )
      .exec();
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async findByMatricule(matricule: string) {
    return this.userModel.findOne({ matricule });
  }

  async findByRole(role: string) {
    return this.userModel
      .find({ role })
      .select('-password -refreshTokenHash -refreshTokenExpiresAt')
      .exec();
  }

  async findByIds(ids: string[]) {
    return this.userModel
      .find({ _id: { $in: ids } })
      .select('-password -refreshTokenHash -refreshTokenExpiresAt')
      .exec();
  }

  async findRoles(roles: string[]) {
    return this.userModel
      .find({ role: { $in: roles } })
      .select('-password -refreshTokenHash -refreshTokenExpiresAt')
      .exec();
  }

  async nextMatricule(role: string): Promise<string> {
    const prefixMap: Record<string, string> = {
      EMPLOYEE:   'EMP',
      HR:         'RH',
      MANAGER:    'MGR',
      SUPERADMIN: 'ADM',
    };
    const prefix = prefixMap[role] ?? 'USR';
    const regex  = new RegExp(`^${prefix}(\\d+)$`);
    const users  = await this.userModel
      .find({ matricule: { $regex: regex } })
      .select('matricule')
      .exec();

    let max = 0;
    for (const u of users) {
      const m = u.matricule?.match(regex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return `${prefix}${max + 1}`;
  }
}
