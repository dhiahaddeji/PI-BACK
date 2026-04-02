import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Competence, CompetenceDocument, EVAL_TO_SCORE } from './competence.schema';
import { FicheCompetence, FicheCompetenceDocument } from './fiche-competence.schema';
import { QuestionCompetence, QuestionCompetenceDocument } from './question-competence.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CompetencesService {
  constructor(
    @InjectModel(Competence.name)         private compModel: Model<CompetenceDocument>,
    @InjectModel(FicheCompetence.name)    private ficheModel: Model<FicheCompetenceDocument>,
    @InjectModel(QuestionCompetence.name) private questionModel: Model<QuestionCompetenceDocument>,
    private readonly notifSvc: NotificationsService,
  ) {}

  // ── Catalogue (HR) ────────────────────────────────────────────────────

  getCatalog() {
    return this.questionModel.find({ actif: true }).sort({ type: 1, intitule: 1 });
  }

  createQuestion(dto: Partial<QuestionCompetence>) {
    return this.questionModel.create(dto);
  }

  deleteQuestion(id: string) {
    return this.questionModel.findByIdAndUpdate(id, { actif: false });
  }

  // ── Fiche de l'employé ────────────────────────────────────────────────

  async getMyFiche(employeeId: string) {
    let fiche = await this.ficheModel.findOne({ employee_id: employeeId });
    if (!fiche) {
      fiche = await this.ficheModel.create({ employee_id: employeeId, etat: 'draft' });
    }
    const competences = await this.compModel.find({ fiche_id: fiche._id.toString() });
    return { fiche, competences };
  }

  // ── Sauvegarder les compétences (draft) ──────────────────────────────

  async saveCompetences(
    employeeId: string,
    employeeName: string,
    items: { type: string; intitule: string; auto_eval: number; question_competence_id?: string }[],
  ) {
    let fiche = await this.ficheModel.findOne({ employee_id: employeeId });
    if (!fiche) {
      fiche = await this.ficheModel.create({
        employee_id: employeeId,
        employee_name: employeeName,
        etat: 'draft',
      });
    } else {
      fiche.employee_name = employeeName;
      fiche.etat = 'draft';
      await fiche.save();
    }

    const ficheId = fiche._id.toString();

    // Delete existing draft competences and replace
    await this.compModel.deleteMany({ fiche_id: ficheId, etat: { $in: ['draft', 'submitted'] } });

    const docs = items.map(item => ({
      fiche_id: ficheId,
      type: item.type,
      intitule: item.intitule,
      auto_eval: item.auto_eval ?? 0,
      hierarchie_eval: -1,
      etat: 'draft',
      question_competence_id: item.question_competence_id,
    }));

    await this.compModel.insertMany(docs);
    return this.getMyFiche(employeeId);
  }

  // ── Soumettre pour validation manager ────────────────────────────────

  async submit(employeeId: string, employeeName: string) {
    const fiche = await this.ficheModel.findOne({ employee_id: employeeId });
    if (!fiche) throw new NotFoundException('Fiche introuvable');

    await this.compModel.updateMany(
      { fiche_id: fiche._id.toString(), etat: 'draft' },
      { etat: 'submitted' },
    );
    fiche.etat = 'submitted';
    if (employeeName) fiche.employee_name = employeeName;
    await fiche.save();

    // Notify all managers
    const name = fiche.employee_name || employeeName || 'Un employé';
    this.notifSvc.notifyManagersSkillSubmitted(employeeId, name, fiche._id.toString()).catch(() => {});

    return this.getMyFiche(employeeId);
  }

  // ── Employee: ajouter une seule compétence (sans tout réinitialiser) ─

  async addSingleCompetence(
    employeeId: string,
    employeeName: string,
    item: { intitule: string; type: string; auto_eval: number; question_competence_id?: string },
  ) {
    let fiche = await this.ficheModel.findOne({ employee_id: employeeId });
    if (!fiche) {
      fiche = await this.ficheModel.create({ employee_id: employeeId, employee_name: employeeName, etat: 'draft' });
    }
    const comp = await this.compModel.create({
      fiche_id: fiche._id.toString(),
      intitule: item.intitule,
      type: item.type,
      auto_eval: item.auto_eval ?? 0,
      hierarchie_eval: -1,
      etat: 'draft',
      question_competence_id: item.question_competence_id,
    });
    return comp;
  }

  // ── Manager: liste des fiches à valider ──────────────────────────────

  async getPendingFiches() {
    const fiches = await this.ficheModel
      .find({ etat: 'submitted' })
      .sort({ updatedAt: -1 });

    const result: any[] = [];
    for (const f of fiches) {
      const competences = await this.compModel.find({ fiche_id: f._id.toString() });
      result.push({ fiche: f, competences });
    }
    return result;
  }

  async getAllFiches() {
    const fiches = await this.ficheModel.find().sort({ updatedAt: -1 });
    const result: any[] = [];
    for (const f of fiches) {
      const competences = await this.compModel.find({ fiche_id: f._id.toString() });
      result.push({ fiche: f, competences });
    }
    return result;
  }

  // ── Manager: évaluer une compétence (hierarchie_eval) ────────────────

  async evalCompetence(competenceId: string, hierarchie_eval: number) {
    const comp = await this.compModel.findByIdAndUpdate(
      competenceId,
      { hierarchie_eval, etat: 'validated' },
      { new: true },
    );
    if (!comp) throw new NotFoundException('Compétence introuvable');
    return comp;
  }

  // ── Manager: modifier auto_eval d'une compétence ──────────────────────

  async updateAutoEval(competenceId: string, auto_eval: number) {
    const comp = await this.compModel.findByIdAndUpdate(
      competenceId,
      { auto_eval },
      { new: true },
    );
    if (!comp) throw new NotFoundException('Compétence introuvable');
    return comp;
  }

  // ── Manager: modifier intitule/type d'une compétence ─────────────────

  async updateCompetence(competenceId: string, dto: { intitule?: string; type?: string; auto_eval?: number; hierarchie_eval?: number }) {
    const comp = await this.compModel.findByIdAndUpdate(
      competenceId,
      { ...dto },
      { new: true },
    );
    if (!comp) throw new NotFoundException('Compétence introuvable');
    return comp;
  }

  // ── Manager: supprimer une compétence ────────────────────────────────

  async deleteCompetence(competenceId: string) {
    const comp = await this.compModel.findByIdAndDelete(competenceId);
    if (!comp) throw new NotFoundException('Compétence introuvable');
    return { deleted: true };
  }

  // ── Manager: ajouter une compétence à une fiche existante ────────────

  async addCompetenceToFiche(ficheId: string, dto: { intitule: string; type: string; auto_eval: number; hierarchie_eval?: number }) {
    const fiche = await this.ficheModel.findById(ficheId);
    if (!fiche) throw new NotFoundException('Fiche introuvable');
    const comp = await this.compModel.create({
      fiche_id: ficheId,
      intitule: dto.intitule,
      type: dto.type,
      auto_eval: dto.auto_eval ?? 0,
      hierarchie_eval: dto.hierarchie_eval ?? -1,
      etat: 'validated',
    });
    return comp;
  }

  // ── Manager: valider la fiche complète ───────────────────────────────

  async validateFiche(ficheId: string, managerId: string) {
    const fiche = await this.ficheModel.findById(ficheId);
    if (!fiche) throw new NotFoundException('Fiche introuvable');

    await this.compModel.updateMany(
      { fiche_id: ficheId, hierarchie_eval: { $eq: -1 } },
      { $set: { hierarchie_eval: 0 } }, // unreviewed → 0
    );
    await this.compModel.updateMany({ fiche_id: ficheId }, { etat: 'validated' });

    fiche.etat = 'validated';
    fiche.validated_by = managerId;
    fiche.validated_at = new Date();
    await fiche.save();

    // Notify employee
    this.notifSvc.notifyEmployeeValidated(
      fiche.employee_id, fiche.employee_name || '', ficheId, managerId,
    ).catch(() => {});

    return this.getFicheById(ficheId);
  }

  // ── Manager: rejeter la fiche ─────────────────────────────────────────

  async rejectFiche(ficheId: string, managerId: string, note: string) {
    const fiche = await this.ficheModel.findById(ficheId);
    if (!fiche) throw new NotFoundException('Fiche introuvable');

    await this.compModel.updateMany({ fiche_id: ficheId }, { etat: 'draft' });

    fiche.etat = 'rejected';
    fiche.validated_by = managerId;
    fiche.rejection_note = note || '';
    await fiche.save();

    // Notify employee
    this.notifSvc.notifyEmployeeRejected(
      fiche.employee_id, fiche.employee_name || '', ficheId, managerId, note,
    ).catch(() => {});

    return fiche;
  }

  async getFicheById(ficheId: string) {
    const fiche = await this.ficheModel.findById(ficheId);
    if (!fiche) throw new NotFoundException('Fiche introuvable');
    const competences = await this.compModel.find({ fiche_id: ficheId });
    return { fiche, competences };
  }

  // ── HR / AI: compétences de tous les employés (pour matching) ─────────

  async getAllEmployeesCompetences() {
    const fiches = await this.ficheModel.find({ etat: 'validated' });
    const result: any[] = [];
    for (const f of fiches) {
      const competences = await this.compModel.find({
        fiche_id: f._id.toString(),
        etat: 'validated',
      });
      result.push({
        employee_id: f.employee_id,
        employee_name: f.employee_name,
        competences: competences.map(c => ({
          _id: c._id,
          type: c.type,
          intitule: c.intitule,
          auto_eval: c.auto_eval,
          hierarchie_eval: c.hierarchie_eval,
          score: EVAL_TO_SCORE[c.hierarchie_eval >= 0 ? c.hierarchie_eval : c.auto_eval] ?? 0,
        })),
      });
    }
    return result;
  }

  // ── HR Analytics ──────────────────────────────────────────────────────

  async getAnalytics() {
    const allComps = await this.compModel.find({ etat: 'validated' });

    const byType: Record<string, number> = { savoir: 0, savoir_faire: 0, savoir_etre: 0 };
    const skillCounts: Record<string, number> = {};
    let totalEval = 0; let evalCount = 0;

    for (const c of allComps) {
      byType[c.type] = (byType[c.type] || 0) + 1;
      skillCounts[c.intitule] = (skillCounts[c.intitule] || 0) + 1;
      const score = c.hierarchie_eval >= 0 ? c.hierarchie_eval : c.auto_eval;
      totalEval += score; evalCount++;
    }

    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([intitule, count]) => ({ intitule, count }));

    const totalFiches = await this.ficheModel.countDocuments();
    const validated   = await this.ficheModel.countDocuments({ etat: 'validated' });
    const pending     = await this.ficheModel.countDocuments({ etat: 'submitted' });

    return {
      totalFiches,
      validated,
      pending,
      avgScore: evalCount > 0 ? +(totalEval / evalCount).toFixed(2) : 0,
      byType,
      topSkills,
    };
  }
}
