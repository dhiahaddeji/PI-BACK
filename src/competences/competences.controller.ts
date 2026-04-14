import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Request, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CompetencesService } from './competences.service';

@Controller('competences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompetencesController {
  constructor(private readonly svc: CompetencesService) {}

  // ── Catalogue HR ─────────────────────────────────────────────────────

  @Roles('HR', 'SUPERADMIN', 'MANAGER', 'EMPLOYEE')
  @Get('catalog')
  getCatalog() { return this.svc.getCatalog(); }

  @Roles('HR', 'SUPERADMIN')
  @Post('catalog')
  createQuestion(@Body() body: any) { return this.svc.createQuestion(body); }

  @Roles('HR', 'SUPERADMIN')
  @Delete('catalog/:id')
  deleteQuestion(@Param('id') id: string) { return this.svc.deleteQuestion(id); }

  // ── Analytics ────────────────────────────────────────────────────────

  @Roles('HR', 'SUPERADMIN', 'MANAGER')
  @Get('analytics')
  getAnalytics() { return this.svc.getAnalytics(); }

  // ── AI: all employees with validated competences ──────────────────────

  @Roles('HR', 'SUPERADMIN')
  @Get('employees-all')
  getAllEmployeesCompetences() { return this.svc.getAllEmployeesCompetences(); }

  // ── Employee: ma fiche ───────────────────────────────────────────────

  @Roles('EMPLOYEE')
  @Get('mine')
  getMyFiche(@Request() req: any) {
    return this.svc.getMyFiche(req.user.userId);
  }

  @Roles('EMPLOYEE')
  @Post('mine/save')
  saveCompetences(
    @Request() req: any,
    @Body() body: { competences: any[] },
  ) {
    const u = req.user;
    const name = u.firstName && u.lastName
      ? `${u.firstName} ${u.lastName}`
      : u.name || u.email;
    return this.svc.saveCompetences(u.userId, name, body.competences || []);
  }

  @Roles('EMPLOYEE')
  @Post('mine/submit')
  submit(@Request() req: any) {
    return this.svc.submit(req.user.userId, req.user.name || '');
  }

  @Roles('EMPLOYEE')
  @Post('mine/add')
  addSingle(
    @Request() req: any,
    @Body() body: { intitule: string; type: string; auto_eval: number; question_competence_id?: string },
  ) {
    const u = req.user;
    const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name || u.email;
    return this.svc.addSingleCompetence(u.userId, name, body);
  }

  // ── Manager: fiches à valider ────────────────────────────────────────

  @Roles('MANAGER', 'SUPERADMIN')
  @Get('pending')
  getPending() { return this.svc.getPendingFiches(); }

  @Roles('MANAGER', 'HR', 'SUPERADMIN')
  @Get('all-fiches')
  getAllFiches() { return this.svc.getAllFiches(); }

  @Roles('MANAGER', 'HR', 'SUPERADMIN')
  @Get('fiche/:id')
  getFiche(@Param('id') id: string) { return this.svc.getFicheById(id); }

  // Évaluer une compétence (hierarchie_eval)
  @Roles('MANAGER', 'SUPERADMIN')
  @Patch('item/:id/eval')
  evalItem(
    @Param('id') id: string,
    @Body() body: { hierarchie_eval: number },
  ) {
    return this.svc.evalCompetence(id, body.hierarchie_eval);
  }

  // Modifier l'auto_eval d'une compétence (manager peut ajuster)
  @Roles('MANAGER', 'SUPERADMIN')
  @Patch('item/:id/auto-eval')
  updateAutoEval(
    @Param('id') id: string,
    @Body() body: { auto_eval: number },
  ) {
    return this.svc.updateAutoEval(id, body.auto_eval);
  }

  // Modifier intitule/type/evals d'une compétence
  @Roles('MANAGER', 'SUPERADMIN')
  @Patch('item/:id')
  updateItem(
    @Param('id') id: string,
    @Body() body: { intitule?: string; type?: string; auto_eval?: number; hierarchie_eval?: number },
  ) {
    return this.svc.updateCompetence(id, body);
  }

  // Supprimer une compétence
  @Roles('MANAGER', 'SUPERADMIN')
  @Delete('item/:id')
  @HttpCode(200)
  deleteItem(@Param('id') id: string) {
    return this.svc.deleteCompetence(id);
  }

  // Ajouter une compétence à une fiche (manager)
  @Roles('MANAGER', 'SUPERADMIN')
  @Post('fiche/:ficheId/add')
  addToFiche(
    @Param('ficheId') ficheId: string,
    @Body() body: { intitule: string; type: string; auto_eval: number; hierarchie_eval?: number },
  ) {
    return this.svc.addCompetenceToFiche(ficheId, body);
  }

  // Valider toute la fiche
  @Roles('MANAGER', 'SUPERADMIN')
  @Patch('fiche/:id/validate')
  validateFiche(@Param('id') id: string, @Request() req: any) {
    return this.svc.validateFiche(id, req.user.userId);
  }

  // Rejeter la fiche
  @Roles('MANAGER', 'SUPERADMIN')
  @Patch('fiche/:id/reject')
  rejectFiche(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { note?: string },
  ) {
    return this.svc.rejectFiche(id, req.user.userId, body.note || '');
  }
}
