import { Body, Controller, Get, Param, Patch, Post, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RecommendationsService } from './recommendations.service';
import { ActivitiesService } from '../activity/activity.service';
import { CompetencesService } from '../competences/competences.service';
import { InvitationsService } from '../invitations/invitations.service';

// Context weights by prioritization strategy
const CONTEXT_WEIGHTS: Record<string, Record<number, number>> = {
  upskilling:    { 0: 1.5, 1: 1.3, 2: 1.0, 3: 0.7, 4: 0.4 },
  consolidation: { 0: 0.5, 1: 0.9, 2: 1.5, 3: 1.2, 4: 0.8 },
  expertise:     { 0: 0.2, 1: 0.5, 2: 0.8, 3: 1.3, 4: 1.8 },
};

const EVAL_LABELS = ['Pas de compétence', 'Notions', 'Pratique', 'Maîtrise', 'Expert'];

@Controller('recommendations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecommendationsController {
  constructor(
    private readonly recService: RecommendationsService,
    private readonly activitiesService: ActivitiesService,
    private readonly compSvc: CompetencesService,
    private readonly invService: InvitationsService,
  ) {}

  // ── GET recommendation for an activity ──────────────────────────────
  @Roles('HR', 'MANAGER', 'SUPERADMIN')
  @Get(':activityId')
  get(@Param('activityId') activityId: string) {
    return this.recService.getByActivity(activityId);
  }

  // ── AI matching: multi-factor scoring ────────────────────────────────
  @Roles('HR', 'SUPERADMIN')
  @Post(':activityId/run-ai')
  async runAI(@Param('activityId') activityId: string) {
    const activity = await this.activitiesService.findById(activityId);
    if (!activity) throw new NotFoundException('Activité introuvable');

    const allEmployees = await this.compSvc.getAllEmployeesCompetences() as any[];

    if (allEmployees.length === 0) {
      throw new BadRequestException(
        'Aucun employé avec des compétences validées. Les employés doivent soumettre et faire valider leurs compétences.',
      );
    }

    const reqs: any[]        = (activity as any).competences_requises || [];
    const seats: number      = (activity as any).seats || 5;
    const prioritization     = (activity as any).prioritization || 'expertise';
    const ctxW               = CONTEXT_WEIGHTS[prioritization] || CONTEXT_WEIGHTS.expertise;
    const totalReqs          = reqs.length;

    const scored = allEmployees.map(emp => {
      const details: any[]       = [];
      const matchedSkills: string[] = [];
      const missingSkills: string[] = [];
      let levelRatioSum    = 0;
      let matchedCount     = 0;
      let ctxScoreSum      = 0;

      for (const req of reqs) {
        const reqName = req.intitule.toLowerCase();
        const match   = emp.competences.find((c: any) =>
          c.intitule.toLowerCase().includes(reqName) ||
          reqName.includes(c.intitule.toLowerCase()) ||
          this.partialMatch(c.intitule.toLowerCase(), reqName),
        );

        if (match) {
          const evalScore    = match.hierarchie_eval >= 0 ? match.hierarchie_eval : match.auto_eval;
          const reqLevel     = req.niveau_min ?? 2;
          const levelRatio   = reqLevel > 0 ? Math.min(1, evalScore / reqLevel) : (evalScore > 0 ? 1 : 0);
          const ctxWeight    = ctxW[evalScore] ?? 1;

          levelRatioSum += levelRatio;
          ctxScoreSum   += evalScore * ctxWeight;
          matchedCount++;
          matchedSkills.push(req.intitule);

          details.push({
            intitule:       req.intitule,
            employee_level: evalScore,
            required_level: reqLevel,
            meets_minimum:  evalScore >= reqLevel,
            level_ratio:    Math.round(levelRatio * 100) / 100,
            ctx_score:      Math.round(evalScore * ctxWeight * 10) / 10,
            emp_label:      EVAL_LABELS[evalScore] ?? '—',
            req_label:      EVAL_LABELS[reqLevel] ?? '—',
          });
        } else {
          missingSkills.push(req.intitule);
          details.push({
            intitule:       req.intitule,
            employee_level: -1,
            required_level: req.niveau_min ?? 2,
            meets_minimum:  false,
            level_ratio:    0,
            ctx_score:      0,
            emp_label:      'Non renseigné',
            req_label:      EVAL_LABELS[req.niveau_min ?? 2] ?? '—',
          });
        }
      }

      const meetsCount = details.filter(d => d.meets_minimum).length;
      const meetsAll   = totalReqs > 0 && meetsCount === totalReqs;

      // ── Multi-factor score (0–100) ─────────────────────────────────
      // skill_match  (50%): proportion of required skills covered
      // level_match  (30%): average ratio of employee level / required level for matched skills
      // exp_bonus    (10%): validated competence breadth (caps at 15)
      // meets_bonus  (10%): proportion of skills where employee meets the minimum level
      const skillMatchScore = totalReqs > 0 ? (matchedCount / totalReqs) * 50 : 50;
      const levelMatchScore = matchedCount > 0 ? (levelRatioSum / matchedCount) * 30 : 0;
      const expBonus        = Math.min(1, emp.competences.length / 15) * 10;
      const meetsBonus      = totalReqs > 0 ? (meetsCount / totalReqs) * 10 : 10;

      const rawScore   = skillMatchScore + levelMatchScore + expBonus + meetsBonus;
      const finalScore = Math.min(100, Math.round(rawScore));

      // ── Human-readable explanation ────────────────────────────────
      const explanation = this.buildExplanation(
        reqs, matchedSkills, missingSkills, meetsCount, totalReqs, emp.competences.length,
      );

      return {
        employeeId:       emp.employee_id,
        employeeName:     emp.employee_name,
        score:            finalScore,
        rank_score:       rawScore,
        details,
        matchedSkills,
        missingSkills,
        totalCompetences: emp.competences.length,
        meetsAll,
        meetsCount,
        explanation,
      };
    });

    // Sort DESC by rank_score
    scored.sort((a, b) => b.rank_score - a.rank_score);

    // Keep only top (seats + 2)
    const limit   = Math.min(scored.length, seats + 2);
    const limited = scored.slice(0, limit);

    const list = limited.map((e, idx) => ({
      employeeId:       e.employeeId,
      employeeName:     e.employeeName,
      score:            e.score,
      rank:             idx + 1,
      status:           idx < seats ? 'Selected' : 'Backup',
      details:          e.details,
      matchedSkills:    e.matchedSkills,
      missingSkills:    e.missingSkills,
      totalCompetences: e.totalCompetences,
      meetsAll:         e.meetsAll,
      meetsCount:       e.meetsCount,
      explanation:      e.explanation,
    }));

    await this.activitiesService.update(activityId, { status: 'AI_SUGGESTED' });
    return this.recService.upsert(activityId, list, false);
  }

  // ── HR: update the selection (add/remove employees) ──────────────────
  @Roles('HR', 'SUPERADMIN')
  @Patch(':activityId')
  updateList(
    @Param('activityId') activityId: string,
    @Body() body: { list: any[] },
  ) {
    return this.recService.upsert(activityId, body.list || [], false);
  }

  // ── HR: validate + send invitations to selected employees ────────────
  @Roles('HR', 'SUPERADMIN')
  @Patch(':activityId/validate')
  async validate(@Param('activityId') activityId: string) {
    const rec = await this.recService.getByActivity(activityId);
    if (!rec?.list?.length) {
      throw new BadRequestException('Aucun employé sélectionné. Lancez l\'IA et sélectionnez des employés.');
    }

    const employeeIds = (rec.list as any[]).map((item: any) => item.employeeId);

    await this.invService.bulkUpsert(activityId, employeeIds);
    await this.activitiesService.update(activityId, {
      status: 'NOTIFIED',
      participants: employeeIds,
    });

    return this.recService.upsert(activityId, rec.list, true);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private buildExplanation(
    _reqs: any[],
    matchedSkills: string[],
    missingSkills: string[],
    meetsCount: number,
    totalReqs: number,
    totalCompetences: number,
  ): string {
    if (totalReqs === 0) {
      return `${totalCompetences} compétence${totalCompetences !== 1 ? 's' : ''} validée${totalCompetences !== 1 ? 's' : ''} — aucun critère spécifique requis.`;
    }
    if (matchedSkills.length === 0) {
      return 'Aucune des compétences requises trouvée dans le profil.';
    }
    if (meetsCount === totalReqs) {
      const top = matchedSkills.slice(0, 2).join(', ');
      return `Excellent profil — toutes les ${totalReqs} compétences requises atteintes au niveau demandé. Points forts : ${top}.`;
    }
    if (matchedSkills.length === totalReqs) {
      const top = matchedSkills.slice(0, 2).join(', ');
      return `Toutes les compétences couvertes (${meetsCount}/${totalReqs} au niveau requis). Points forts : ${top}.`;
    }
    const top  = matchedSkills.slice(0, 2).join(', ');
    const miss = missingSkills.slice(0, 2).join(', ');
    return `${matchedSkills.length}/${totalReqs} compétences couvertes${top ? ` (${top})` : ''}. Manque : ${miss}.`;
  }

  private partialMatch(name: string, kw: string): boolean {
    const nameParts = name.split(/\s+/);
    const kwParts   = kw.split(/\s+/);
    return nameParts.some(np => kwParts.some(kp => np.includes(kp) && kp.length > 3));
  }
}
