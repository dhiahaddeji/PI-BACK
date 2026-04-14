import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SkillRequest, SkillRequestDocument, SkillItem } from './skill-request.schema';
import { UsersService } from '../users/users.service';

const LEVEL_SCORE: Record<string, number> = { LOW: 25, MEDIUM: 50, HIGH: 75, EXPERT: 100 };

function computeGlobalScore(skills: SkillItem[]): number {
  if (!skills.length) return 0;
  const total = skills.reduce((sum, s) => sum + (LEVEL_SCORE[s.level] || 0), 0);
  return Math.round(total / skills.length);
}

@Injectable()
export class SkillsService {
  constructor(
    @InjectModel(SkillRequest.name)
    private skillRequestModel: Model<SkillRequestDocument>,
    private usersService: UsersService,
  ) {}

  // ── Employee: get my approved skills + pending request ──────────────
  async getMySkills(employeeId: string) {
    const user = await this.usersService.findById(employeeId) as any;
    const pending = await this.skillRequestModel.findOne({
      employeeId,
      status: 'PENDING',
    });
    return {
      approved: {
        savoir:       user.savoir       || [],
        savoir_faire: user.savoir_faire || [],
        savoir_etre:  user.savoir_etre  || [],
        globalScore:  user.globalScore  || 0,
      },
      pending: pending
        ? {
            _id: pending._id,
            savoir:       pending.savoir,
            savoir_faire: pending.savoir_faire,
            savoir_etre:  pending.savoir_etre,
            status:       pending.status,
            createdAt:    (pending as any).createdAt,
          }
        : null,
    };
  }

  // ── Employee: submit skill update request ────────────────────────────
  async submitRequest(
    employeeId: string,
    employeeName: string,
    savoir: SkillItem[],
    savoir_faire: SkillItem[],
    savoir_etre: SkillItem[],
  ) {
    await this.skillRequestModel.deleteMany({ employeeId, status: 'PENDING' });
    const req = new this.skillRequestModel({
      employeeId, employeeName, savoir, savoir_faire, savoir_etre, status: 'PENDING',
    });
    return req.save();
  }

  // ── Manager / HR: get pending requests ──────────────────────────────
  async getPending() {
    return this.skillRequestModel.find({ status: 'PENDING' }).sort({ createdAt: -1 });
  }

  async getAll() {
    return this.skillRequestModel.find().sort({ createdAt: -1 });
  }

  // ── Manager: approve ─────────────────────────────────────────────────
  async approve(requestId: string, managerId: string, note?: string) {
    const req = await this.skillRequestModel.findById(requestId);
    if (!req) throw new NotFoundException('Demande introuvable');

    const allSkills = [...req.savoir, ...req.savoir_faire, ...req.savoir_etre];
    const globalScore = computeGlobalScore(allSkills);

    await this.usersService.update(req.employeeId, {
      savoir:       req.savoir,
      savoir_faire: req.savoir_faire,
      savoir_etre:  req.savoir_etre,
      globalScore,
    });

    req.status    = 'APPROVED';
    req.reviewedBy  = managerId;
    req.reviewNote  = note || '';
    req.reviewedAt  = new Date();
    return req.save();
  }

  // ── Manager: reject ──────────────────────────────────────────────────
  async reject(requestId: string, managerId: string, note?: string) {
    const req = await this.skillRequestModel.findById(requestId);
    if (!req) throw new NotFoundException('Demande introuvable');
    req.status    = 'REJECTED';
    req.reviewedBy  = managerId;
    req.reviewNote  = note || '';
    req.reviewedAt  = new Date();
    return req.save();
  }

  // ── Post-activity: update skill score after participation ────────────
  async postActivityEvaluation(
    employeeId: string,
    skillUpdates: { skillName: string; newLevel: string }[],
  ) {
    const user = await this.usersService.findById(employeeId) as any;
    const levelMap: Record<string, string> = {};
    for (const u of skillUpdates) levelMap[u.skillName.toLowerCase()] = u.newLevel;

    const upgrade = (skills: SkillItem[]) =>
      skills.map((s) => {
        const key = s.name.toLowerCase();
        if (levelMap[key]) {
          return { ...s, level: levelMap[key], score: LEVEL_SCORE[levelMap[key]] || s.score };
        }
        return s;
      });

    const newSavoir      = upgrade(user.savoir      || []);
    const newSavoirFaire = upgrade(user.savoir_faire || []);
    const newSavoirEtre  = upgrade(user.savoir_etre  || []);
    const allSkills      = [...newSavoir, ...newSavoirFaire, ...newSavoirEtre];
    const globalScore    = computeGlobalScore(allSkills);

    return this.usersService.update(employeeId, {
      savoir:       newSavoir,
      savoir_faire: newSavoirFaire,
      savoir_etre:  newSavoirEtre,
      globalScore,
    });
  }

  // ── HR: get one employee's skills ────────────────────────────────────
  async getEmployeeSkills(employeeId: string) {
    const user = await this.usersService.findById(employeeId) as any;
    return {
      savoir:       user.savoir       || [],
      savoir_faire: user.savoir_faire || [],
      savoir_etre:  user.savoir_etre  || [],
      globalScore:  user.globalScore  || 0,
    };
  }

  // ── HR Analytics: skills by department ───────────────────────────────
  async getSkillsAnalytics() {
    const employees = await this.usersService.findByRole('EMPLOYEE');
    const byDept: Record<string, any> = {};
    const skillCoverage: Record<string, number> = {};
    let totalScore = 0;
    let withSkills = 0;

    for (const emp of employees as any[]) {
      const dept = emp.departement_id || 'Non assigné';
      if (!byDept[dept]) byDept[dept] = { employees: 0, totalScore: 0, skills: [] };
      byDept[dept].employees++;

      const allSkills = [...(emp.savoir || []), ...(emp.savoir_faire || []), ...(emp.savoir_etre || [])];
      if (allSkills.length > 0) withSkills++;
      totalScore += emp.globalScore || 0;

      byDept[dept].totalScore += emp.globalScore || 0;
      for (const sk of allSkills) {
        byDept[dept].skills.push(sk.name);
        skillCoverage[sk.name] = (skillCoverage[sk.name] || 0) + 1;
      }
    }

    const deptStats = Object.entries(byDept).map(([dept, data]: any) => ({
      department: dept,
      employeeCount: data.employees,
      avgScore: data.employees > 0 ? Math.round(data.totalScore / data.employees) : 0,
      topSkills: [...new Set<string>(data.skills)].slice(0, 5),
    }));

    const topSkills = Object.entries(skillCoverage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      totalEmployees: employees.length,
      withSkills,
      avgGlobalScore: employees.length > 0 ? Math.round(totalScore / employees.length) : 0,
      byDepartment: deptStats,
      topSkills,
      coveragePercent: employees.length > 0 ? Math.round((withSkills / employees.length) * 100) : 0,
    };
  }

  // ── AI: all employees with skills (scored) ───────────────────────────
  async getAllEmployeeSkills() {
    const employees = await this.usersService.findByRole('EMPLOYEE');
    return employees.map((e: any) => ({
      _id: e._id,
      name: e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : e.name,
      email: e.email,
      matricule: e.matricule,
      departement_id: e.departement_id,
      globalScore: e.globalScore || 0,
      yearsExperience: e.yearsExperience || 0,
      savoir:       e.savoir       || [],
      savoir_faire: e.savoir_faire || [],
      savoir_etre:  e.savoir_etre  || [],
    }));
  }
}
