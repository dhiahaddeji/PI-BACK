import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department, DepartmentDocument } from './department.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name) private model: Model<DepartmentDocument>,
    private readonly usersService: UsersService,
  ) {}

  findAll() {
    return this.model.find().sort({ name: 1 });
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  create(dto: Partial<Department>) {
    return this.model.create(dto);
  }

  async update(id: string, dto: Partial<Department>) {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!doc) throw new NotFoundException('Département introuvable');
    return doc;
  }

  delete(id: string) {
    return this.model.findByIdAndDelete(id);
  }

  // ── Departments enriched with employees + manager ─────────────────────
  async getWithMembers() {
    const [departments, allUsers] = await Promise.all([
      this.model.find().sort({ name: 1 }).lean(),
      this.usersService.findAll(),
    ]);

    const employees = (allUsers as any[]).filter(u => u.role === 'EMPLOYEE');
    const managers  = (allUsers as any[]).filter(u => u.role === 'MANAGER');

    const managerMap = new Map(managers.map(m => [String(m._id), m]));

    const enriched = departments.map(dept => {
      const deptId  = String((dept as any)._id);
      const members = employees.filter(e => e.departement_id === deptId);
      const manager = dept.manager_id ? (managerMap.get(dept.manager_id) ?? null) : null;
      return {
        ...dept,
        manager: manager
          ? { _id: String(manager._id), name: manager.name, email: manager.email }
          : null,
        employees: members.map(e => ({
          _id:       String(e._id),
          name:      e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim(),
          email:     e.email,
          matricule: e.matricule,
          poste:     e.poste || '',
        })),
      };
    });

    const assignedIds = new Set(
      employees.filter(e => e.departement_id).map(e => String(e._id)),
    );

    const unassigned = employees
      .filter(e => !e.departement_id)
      .map(e => ({
        _id:       String(e._id),
        name:      e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim(),
        email:     e.email,
        matricule: e.matricule,
        poste:     e.poste || '',
      }));

    return { departments: enriched, unassigned, managers: managers.map(m => ({
      _id:   String(m._id),
      name:  m.name,
      email: m.email,
    })) };
  }
}
