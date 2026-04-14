import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { CompetencesService } from '../competences/competences.service';
import { NlpService } from './nlp.service';
import { MatchingService, CTX_LABEL } from './matching.service';

@Injectable()
export class AiService {
  private readonly client: OpenAI;

  constructor(
    private readonly compSvc:    CompetencesService,
    private readonly nlp:        NlpService,
    private readonly matching:   MatchingService,
  ) {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CV Analysis
  // ─────────────────────────────────────────────────────────────────────────

  async analyzeCv(pdfBuffer: Buffer): Promise<{
    skills: { intitule: string; type: string; auto_eval: number; confidence: number; years_exp?: number }[];
    summary:    string;
    total:      number;
    mode:       string;
  }> {
    const base64Pdf = pdfBuffer.toString('base64');

    const prompt = `Tu es un expert RH spécialisé en analyse de CV. Lis attentivement ce CV et extrait toutes les compétences professionnelles mentionnées.

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans explication) dans ce format exact :
{
  "summary": "Résumé du profil en 1 phrase",
  "skills": [
    {
      "intitule": "Python",
      "type": "savoir",
      "auto_eval": 3,
      "confidence": 90,
      "years_exp": 4
    }
  ]
}

Règles strictes :
- "type" : "savoir" (connaissances techniques/théoriques) | "savoir_faire" (compétences pratiques/méthodologiques) | "savoir_etre" (soft skills)
- "auto_eval" : 1=Notions, 2=Pratique, 3=Maîtrise, 4=Expert (déduit du contexte : titres, années d'expérience, projets)
- "confidence" : 0-100 (ta certitude que cette compétence est bien présente dans le CV)
- "years_exp" : années d'expérience pour cette compétence si mentionné explicitement, sinon null
- Maximum 25 compétences, les plus pertinentes uniquement
- Pas de doublons — normalise les noms (ex: "JS" → "JavaScript", "ML" → "Machine Learning")
- Inclus les compétences techniques, méthodologiques ET les soft skills
- Intitulés en français ou en anglais selon l'usage courant (ex: Docker, Gestion de projet, Leadership)`;

    // ── Try OpenAI ────────────────────────────────────────────────────────
    try {
      const response = await this.client.chat.completions.create({
        model:      'gpt-4o-mini',
        max_tokens: 2000,
        messages: [{
          role:    'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:application/pdf;base64,${base64Pdf}` },
            } as any,
            { type: 'text', text: prompt },
          ],
        }],
      });

      const raw     = (response.choices[0].message.content || '').trim();
      const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed  = JSON.parse(jsonStr);

      // Normalize + deduplicate via NlpService
      type SkillRow = { intitule: string; type: string; auto_eval: number; confidence: number; years_exp?: number };
      const rawSkills: SkillRow[] = (parsed.skills || []).map((s: any): SkillRow => ({
        intitule:   this.nlp.normalize(s.intitule || ''),
        type:       s.type       || 'savoir',
        auto_eval:  s.auto_eval  ?? 2,
        confidence: s.confidence ?? 70,
        years_exp:  s.years_exp  ?? undefined,
      }));
      const skills = this.nlp.deduplicate(rawSkills);

      return {
        skills,
        summary: parsed.summary || '',
        total:   skills.length,
        mode:    'openai',
      };
    } catch { /* fall through to rule-based */ }

    // ── Rule-based fallback ───────────────────────────────────────────────
    const text         = pdfBuffer.toString('utf-8').toLowerCase().replace(/[^\x20-\x7e\n]/g, ' ');
    const expBySkill   = this.nlp.extractExperience(text);
    return this.ruleBasedCvAnalysis(text, expBySkill);
  }

  private ruleBasedCvAnalysis(
    text: string,
    expBySkill: Record<string, number>,
  ): {
    skills:   { intitule: string; type: string; auto_eval: number; confidence: number; years_exp?: number }[];
    summary:  string;
    total:    number;
    mode:     string;
  } {
    // Extended catalog with confidence weights
    const CATALOG: { kw: string; intitule: string; type: string; eval: number; weight: number }[] = [
      // Savoir — langages & frameworks
      { kw: 'python',            intitule: 'Python',               type: 'savoir',       eval: 3, weight: 10 },
      { kw: 'java ',             intitule: 'Java',                 type: 'savoir',       eval: 3, weight: 10 },
      { kw: 'javascript',        intitule: 'JavaScript',           type: 'savoir',       eval: 3, weight: 10 },
      { kw: 'typescript',        intitule: 'TypeScript',           type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'react',             intitule: 'React',                type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'angular',           intitule: 'Angular',              type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'vue',               intitule: 'Vue.js',               type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'node',              intitule: 'Node.js',              type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'nestjs',            intitule: 'NestJS',               type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'spring',            intitule: 'Spring Boot',          type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'c++',               intitule: 'C++',                  type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'c#',                intitule: 'C#',                   type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'php',               intitule: 'PHP',                  type: 'savoir',       eval: 2, weight: 7  },
      { kw: 'flutter',           intitule: 'Flutter',              type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'swift',             intitule: 'Swift',                type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'kotlin',            intitule: 'Kotlin',               type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'html',              intitule: 'HTML/CSS',             type: 'savoir',       eval: 2, weight: 7  },
      // Savoir — bases de données
      { kw: 'sql',               intitule: 'SQL',                  type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'mongodb',           intitule: 'MongoDB',              type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'mysql',             intitule: 'MySQL',                type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'postgresql',        intitule: 'PostgreSQL',           type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'redis',             intitule: 'Redis',                type: 'savoir',       eval: 2, weight: 7  },
      // Savoir — DevOps / Cloud
      { kw: 'docker',            intitule: 'Docker',               type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'kubernetes',        intitule: 'Kubernetes',           type: 'savoir',       eval: 3, weight: 9  },
      { kw: 'git',               intitule: 'Git',                  type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'linux',             intitule: 'Linux',                type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'aws',               intitule: 'AWS',                  type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'azure',             intitule: 'Azure',                type: 'savoir',       eval: 2, weight: 9  },
      { kw: 'ci/cd',             intitule: 'CI/CD',                type: 'savoir',       eval: 2, weight: 8  },
      // Savoir — AI / Data
      { kw: 'machine learning',  intitule: 'Machine Learning',     type: 'savoir',       eval: 3, weight: 10 },
      { kw: 'deep learning',     intitule: 'Deep Learning',        type: 'savoir',       eval: 3, weight: 10 },
      { kw: 'data science',      intitule: 'Data Science',         type: 'savoir',       eval: 3, weight: 10 },
      { kw: 'nlp',               intitule: 'NLP',                  type: 'savoir',       eval: 3, weight: 9  },
      { kw: 'tensorflow',        intitule: 'TensorFlow',           type: 'savoir',       eval: 3, weight: 9  },
      { kw: 'pytorch',           intitule: 'PyTorch',              type: 'savoir',       eval: 3, weight: 9  },
      { kw: 'pandas',            intitule: 'Pandas',               type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'scikit',            intitule: 'Scikit-learn',         type: 'savoir',       eval: 2, weight: 8  },
      // Savoir — Analytics / Business
      { kw: 'excel',             intitule: 'Excel',                type: 'savoir',       eval: 2, weight: 7  },
      { kw: 'power bi',          intitule: 'Power BI',             type: 'savoir',       eval: 2, weight: 8  },
      { kw: 'tableau',           intitule: 'Tableau',              type: 'savoir',       eval: 2, weight: 7  },
      { kw: 'comptabilit',       intitule: 'Comptabilité',         type: 'savoir',       eval: 2, weight: 7  },
      { kw: 'finance',           intitule: 'Finance',              type: 'savoir',       eval: 2, weight: 7  },
      { kw: 'audit',             intitule: 'Audit',                type: 'savoir',       eval: 2, weight: 7  },
      { kw: 'assurance',         intitule: 'Assurance',            type: 'savoir',       eval: 2, weight: 7  },
      { kw: 'marketing',         intitule: 'Marketing digital',    type: 'savoir',       eval: 2, weight: 7  },
      // Savoir-faire — méthodologies
      { kw: 'agile',             intitule: 'Méthode Agile',        type: 'savoir_faire', eval: 2, weight: 8  },
      { kw: 'scrum',             intitule: 'Scrum',                type: 'savoir_faire', eval: 2, weight: 8  },
      { kw: 'devops',            intitule: 'DevOps',               type: 'savoir_faire', eval: 3, weight: 9  },
      { kw: 'gestion de projet', intitule: 'Gestion de projet',    type: 'savoir_faire', eval: 2, weight: 8  },
      { kw: 'project management',intitule: 'Gestion de projet',    type: 'savoir_faire', eval: 2, weight: 8  },
      { kw: 'analyse',           intitule: 'Analyse',              type: 'savoir_faire', eval: 2, weight: 6  },
      { kw: 'conception',        intitule: 'Conception',           type: 'savoir_faire', eval: 2, weight: 6  },
      { kw: 'test',              intitule: 'Tests logiciels',      type: 'savoir_faire', eval: 2, weight: 7  },
      { kw: 'rédaction',         intitule: 'Rédaction technique',  type: 'savoir_faire', eval: 2, weight: 6  },
      { kw: 'présentation',      intitule: 'Présentation',         type: 'savoir_faire', eval: 2, weight: 6  },
      { kw: 'négociation',       intitule: 'Négociation',          type: 'savoir_faire', eval: 2, weight: 7  },
      { kw: 'formation',         intitule: 'Formation',            type: 'savoir_faire', eval: 2, weight: 6  },
      // Savoir-être — soft skills
      { kw: 'communication',     intitule: 'Communication',        type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'leadership',        intitule: 'Leadership',           type: 'savoir_etre',  eval: 3, weight: 8  },
      { kw: 'team',              intitule: 'Travail en équipe',    type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'autonomie',         intitule: 'Autonomie',            type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'adaptabilit',       intitule: 'Adaptabilité',         type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'créativit',         intitule: 'Créativité',           type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'rigueur',           intitule: 'Rigueur',              type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'organisat',         intitule: 'Organisation',         type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'proactif',          intitule: 'Proactivité',          type: 'savoir_etre',  eval: 3, weight: 7  },
      { kw: 'problem',           intitule: 'Résolution de problèmes', type: 'savoir_etre', eval: 2, weight: 7 },
    ];

    const isExpert = /expert|senior|lead|chief|architect|principal/i.test(text);
    const isJunior = /junior|stagiaire|apprenti|débutant/i.test(text);

    const rawSkills: { intitule: string; type: string; auto_eval: number; confidence: number; years_exp?: number }[] = [];

    for (const entry of CATALOG) {
      if (!text.includes(entry.kw)) continue;

      // Confidence: base weight × occurrence boost
      const escapedKw   = entry.kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const occurrences = (text.match(new RegExp(escapedKw, 'g')) || []).length;
      const confidence  = Math.min(95, entry.weight * 8 + Math.min(occurrences - 1, 3) * 5);

      let level = entry.eval;
      if (isExpert) level = Math.min(4, level + 1);
      if (isJunior) level = Math.max(1, level - 1);

      const normalizedName = this.nlp.normalize(entry.intitule);
      const expKey         = normalizedName.toLowerCase();
      const years_exp      = expBySkill[expKey] ?? undefined;

      // Boost eval based on declared experience years
      if (years_exp) {
        if (years_exp >= 5)      level = Math.min(4, Math.max(level, 4));
        else if (years_exp >= 3) level = Math.min(4, Math.max(level, 3));
        else if (years_exp >= 1) level = Math.min(4, Math.max(level, 2));
      }

      rawSkills.push({ intitule: normalizedName, type: entry.type, auto_eval: level, confidence, years_exp });
      if (rawSkills.length >= 25) break;
    }

    const skills     = this.nlp.deduplicate(rawSkills);
    const techCount  = skills.filter(s => s.type === 'savoir').length;
    const summary    = skills.length > 0
      ? `Profil détecté : ${techCount} compétence(s) technique(s), ${skills.length - techCount} transversales (extraction locale).`
      : 'Aucune compétence détectée — le CV est peut-être scanné ou en image.';

    return { skills, summary, total: skills.length, mode: 'rule-based' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dashboard AI Insights
  // ─────────────────────────────────────────────────────────────────────────

  async getDashboardInsights(role: string, data: any): Promise<{ insight: string; tips: string[] }> {
    const prompt = this.buildInsightPrompt(role, data);
    if (!prompt) return this.ruleBasedInsights(role, data);

    try {
      const response = await this.client.chat.completions.create({
        model:      'gpt-4o-mini',
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      });
      const raw     = (response.choices[0].message.content || '').trim();
      const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed  = JSON.parse(jsonStr);
      return { insight: parsed.insight || '', tips: parsed.tips || [] };
    } catch {
      return this.ruleBasedInsights(role, data);
    }
  }

  private buildInsightPrompt(role: string, data: any): string {
    if (role === 'EMPLOYEE') {
      const { competences = [], ficheEtat = 'draft', invitations = [] } = data;
      const compList = competences.map((c: any) => `${c.intitule} (niveau ${c.auto_eval}/4)`).join(', ');
      return `Tu es un coach de carrière expert. Analyse le profil de cet employé et donne des conseils personnalisés.

Statut fiche compétences: ${ficheEtat}
Compétences déclarées: ${compList || 'Aucune'}
Nombre d'activités/formations: ${invitations.length}

Réponds en JSON:
{"insight": "Message encourageant en 2 phrases max (tutoie)", "tips": ["Conseil 1", "Conseil 2", "Conseil 3"]}`;
    }

    if (role === 'MANAGER') {
      const { pendingFiches = 0, teamSize = 0, activities = [] } = data;
      return `Tu es un expert en management. Donne des insights au manager.

Fiches en attente: ${pendingFiches} | Équipe: ${teamSize} | Activités: ${activities.length}

Réponds en JSON:
{"insight": "Analyse managériale en 2 phrases", "tips": ["Action 1", "Action 2", "Action 3"]}`;
    }

    if (role === 'HR') {
      const { totalEmployees = 0, validatedFiches = 0, pendingFiches = 0, activities = [] } = data;
      const rate = totalEmployees > 0 ? Math.round((validatedFiches / totalEmployees) * 100) : 0;
      return `Tu es un expert RH stratégique. Analyse les données RH.

Employés: ${totalEmployees} | Validées: ${validatedFiches} (${rate}%) | En attente: ${pendingFiches} | Activités: ${activities.length}

Réponds en JSON:
{"insight": "Analyse stratégique RH en 2 phrases", "tips": ["Recommandation 1", "Recommandation 2", "Recommandation 3"]}`;
    }

    if (role === 'SUPERADMIN') {
      const { totalUsers = 0, usersByRole = {}, totalActivities = 0 } = data;
      const breakdown = Object.entries(usersByRole).map(([r, n]) => `${r}: ${n}`).join(', ');
      return `Tu es un consultant en transformation digitale. Analyse la plateforme.

Utilisateurs: ${totalUsers} (${breakdown}) | Activités: ${totalActivities}

Réponds en JSON:
{"insight": "Vision globale en 2 phrases", "tips": ["Initiative 1", "Initiative 2", "Initiative 3"]}`;
    }

    return '';
  }

  private ruleBasedInsights(role: string, data: any): { insight: string; tips: string[] } {
    if (role === 'EMPLOYEE') {
      const { competences = [], ficheEtat = 'draft', invitations = [] } = data;
      const n            = competences.length;
      const hasSubmitted = ficheEtat === 'submitted' || ficheEtat === 'validated';
      return {
        insight: n === 0
          ? `Tu n'as pas encore de compétences renseignées. C'est le moment de compléter ta fiche !`
          : `Tu as ${n} compétence(s) déclarée(s) et ${invitations.length} invitation(s). ${hasSubmitted ? 'Ta fiche est en cours de validation.' : 'Pense à soumettre ta fiche pour validation.'}`,
        tips: [
          n === 0 ? 'Commence par ajouter tes compétences dans "Mes Compétences"' : 'Vérifie que tes niveaux d\'auto-évaluation sont à jour',
          !hasSubmitted ? 'Soumets ta fiche de compétences pour validation' : 'Consulte les retours de ton manager',
          invitations.length === 0 ? 'Explore les activités disponibles' : 'Réponds aux invitations en attente',
        ],
      };
    }
    if (role === 'MANAGER') {
      const { pendingFiches = 0, activities = [] } = data;
      return {
        insight: `${pendingFiches} fiche(s) en attente de validation et ${activities.length} activité(s).`,
        tips: [
          pendingFiches > 0 ? `Valide les ${pendingFiches} fiche(s) en attente` : 'Toutes les fiches sont à jour',
          'Identifie les axes de développement de ton équipe',
          activities.length > 0 ? 'Examine les activités en attente' : 'Propose de nouvelles activités',
        ],
      };
    }
    if (role === 'HR') {
      const { totalEmployees = 0, validatedFiches = 0, pendingFiches = 0, activities = [] } = data;
      const rate = totalEmployees > 0 ? Math.round((validatedFiches / totalEmployees) * 100) : 0;
      return {
        insight: `${totalEmployees} employé(s), taux de validation : ${rate}%. ${pendingFiches} fiche(s) en attente.`,
        tips: [
          rate < 50 ? 'Relancez les employés sans fiche soumise' : 'Bon taux de couverture — continuez',
          `${activities.length} activité(s) créée(s) — analysez les tendances`,
          'Exportez un rapport pour identifier les lacunes organisationnelles',
        ],
      };
    }
    if (role === 'SUPERADMIN') {
      const { totalUsers = 0, usersByRole = {}, totalActivities = 0 } = data;
      return {
        insight: `${totalUsers} utilisateur(s), ${Object.keys(usersByRole).length} rôles, ${totalActivities} activité(s).`,
        tips: [
          (usersByRole['EMPLOYEE'] || 0) < 5 ? 'Invitez plus d\'employés' : 'Base d\'employés solide',
          'Vérifiez que tous les managers ont des équipes assignées',
          'Consultez les statistiques de compétences pour une vue complète',
        ],
      };
    }
    return { insight: 'Bienvenue sur votre tableau de bord.', tips: [] };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI Chat (employee matching)
  // ─────────────────────────────────────────────────────────────────────────

  async chat(
    message: string,
    context?: {
      requiredSkills?:   string[];
      prioritization?:   string;
      recommendedList?:  any[];
      activityTitle?:    string;
    },
  ): Promise<{ reply: string; employees: any[] }> {
    const msg  = message.toLowerCase();
    const list = context?.recommendedList;

    // ── Recommendation-aware mode ─────────────────────────────────────────
    if (list?.length) {
      const namedEmployee = this.findEmployeeByName(msg, list);
      if (namedEmployee) return { reply: this.buildWhyReply(namedEmployee, context?.activityTitle), employees: [] };
      if (msg.includes('manque') || msg.includes('missing') || msg.includes('sans ') || msg.includes('absent'))
        return { reply: this.buildMissingReply(list, this.matching.extractKeywords(msg), context?.activityTitle), employees: [] };
      if (msg.includes('backup') || msg.includes('réserve') || msg.includes('remplaç'))
        return { reply: this.buildBackupReply(list, context?.activityTitle), employees: [] };
      return { reply: this.buildListReply(list, context?.activityTitle), employees: [] };
    }

    // ── Standard chat mode ────────────────────────────────────────────────
    const allEmployees = await this.compSvc.getAllEmployeesCompetences();

    if (allEmployees.length === 0) {
      return {
        reply: '⚠️ Aucun employé avec des compétences validées n\'a été trouvé.\n\n' +
               'Pour utiliser l\'IA :\n' +
               '1. Les employés renseignent leurs compétences\n' +
               '2. Ils soumettent leur fiche pour validation\n' +
               '3. Un manager valide les compétences',
        employees: [],
      };
    }

    const topN           = this.matching.extractTopN(msg);
    const keywords       = this.matching.extractKeywords(msg);
    const prioritization = context?.prioritization || this.matching.detectPrioritization(msg);

    try {
      const scored = await this.matching.scoreEmployees(allEmployees as any[], keywords, prioritization);
      const top    = scored.slice(0, topN);
      const reply  = this.buildReply(top, keywords, topN, prioritization);

      return {
        reply,
        employees: top.map(e => ({
          employee_id: e.employee_id,
          name:        e.employee_name,
          score:       e.computedScore,
          matched:     e.matched,
          competences: e.competences,
        })),
      };
    } catch {
      return {
        reply: '⚠️ Erreur lors de l\'analyse. Réessayez avec un autre message.',
        employees: [],
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match activity vs employees
  // ─────────────────────────────────────────────────────────────────────────

  async matchActivity(_activityId: string, competencesRequises: any[], prioritization: string) {
    const allEmployees = await this.compSvc.getAllEmployeesCompetences();
    return this.matching.matchCompetences(allEmployees as any[], competencesRequises, prioritization);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NLP: extract skills from activity description
  // ─────────────────────────────────────────────────────────────────────────

  extractSkillsFromDescription(description: string): {
    suggested_skills: { intitule: string; type: string; niveau_min: number }[];
    prioritization:   string;
    type:             string;
  } {
    const text = description.toLowerCase();

    const CATALOG: { kw: string; intitule: string; type: string }[] = [
      { kw: 'python',             intitule: 'Python',                 type: 'savoir'       },
      { kw: 'java',               intitule: 'Java',                   type: 'savoir'       },
      { kw: 'javascript',         intitule: 'JavaScript',             type: 'savoir'       },
      { kw: 'typescript',         intitule: 'TypeScript',             type: 'savoir'       },
      { kw: 'sql',                intitule: 'SQL',                    type: 'savoir'       },
      { kw: 'machine learning',   intitule: 'Machine Learning',       type: 'savoir'       },
      { kw: 'deep learning',      intitule: 'Deep Learning',          type: 'savoir'       },
      { kw: 'nlp',                intitule: 'NLP',                    type: 'savoir'       },
      { kw: 'data science',       intitule: 'Data Science',           type: 'savoir'       },
      { kw: 'cloud',              intitule: 'Cloud Computing',        type: 'savoir'       },
      { kw: 'docker',             intitule: 'Docker',                 type: 'savoir'       },
      { kw: 'devops',             intitule: 'DevOps',                 type: 'savoir'       },
      { kw: 'react',              intitule: 'React',                  type: 'savoir'       },
      { kw: 'agile',              intitule: 'Agile',                  type: 'savoir'       },
      { kw: 'comptabilité',       intitule: 'Comptabilité',           type: 'savoir'       },
      { kw: 'finance',            intitule: 'Finance',                type: 'savoir'       },
      { kw: 'audit',              intitule: 'Audit',                  type: 'savoir'       },
      { kw: 'assurance',          intitule: 'Assurance',              type: 'savoir'       },
      { kw: 'excel',              intitule: 'Excel',                  type: 'savoir'       },
      { kw: 'power bi',           intitule: 'Power BI',               type: 'savoir'       },
      { kw: 'gestion de projet',  intitule: 'Gestion de projet',      type: 'savoir_faire' },
      { kw: 'développement',      intitule: 'Développement logiciel', type: 'savoir_faire' },
      { kw: 'analyse',            intitule: 'Analyse',                type: 'savoir_faire' },
      { kw: 'présentation',       intitule: 'Présentation',           type: 'savoir_faire' },
      { kw: 'négociation',        intitule: 'Négociation',            type: 'savoir_faire' },
      { kw: 'rédaction',          intitule: 'Rédaction',              type: 'savoir_faire' },
      { kw: 'communication',      intitule: 'Communication',          type: 'savoir_etre'  },
      { kw: 'leadership',         intitule: 'Leadership',             type: 'savoir_etre'  },
      { kw: 'travail d\'équipe',  intitule: 'Travail en équipe',      type: 'savoir_etre'  },
      { kw: 'adaptabilité',       intitule: 'Adaptabilité',           type: 'savoir_etre'  },
      { kw: 'autonomie',          intitule: 'Autonomie',              type: 'savoir_etre'  },
      { kw: 'créativité',         intitule: 'Créativité',             type: 'savoir_etre'  },
    ];

    const detected = CATALOG
      .filter(c => text.includes(c.kw))
      .map(d => ({ ...d, intitule: this.nlp.normalize(d.intitule) }));

    let niveau_min = 2;
    if (text.includes('expert') || text.includes('avancé'))                                         niveau_min = 4;
    else if (text.includes('maîtrise') || text.includes('confirmé'))                                niveau_min = 3;
    else if (text.includes('débutant') || text.includes('junior') || text.includes('initiation'))   niveau_min = 1;

    let prioritization = 'expertise';
    if (text.includes('upskill') || text.includes('formation') || text.includes('débutant'))        prioritization = 'upskilling';
    else if (text.includes('consolid') || text.includes('intermédiaire'))                           prioritization = 'consolidation';

    let type = 'formation';
    if (text.includes('certif'))                                   type = 'certification';
    else if (text.includes('audit'))                               type = 'audit';
    else if (text.includes('projet') || text.includes('project')) type = 'projet';
    else if (text.includes('mission'))                             type = 'mission';

    return {
      suggested_skills: detected.map(d => ({ intitule: d.intitule, type: d.type, niveau_min })),
      prioritization,
      type,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reply builders (chat context)
  // ─────────────────────────────────────────────────────────────────────────

  private buildWhyReply(emp: any, activityTitle?: string): string {
    const ctx = activityTitle ? ` pour "${activityTitle}"` : '';
    let reply = `**Pourquoi ${emp.employeeName} a été sélectionné${ctx} :**\n\n`;
    reply += `📊 **Score global : ${emp.score}%** (rang #${emp.rank})\n`;
    reply += `🏷️ **Statut : ${emp.status === 'Selected' ? '✅ Sélectionné' : '🔄 Backup'}**\n\n`;
    reply += `💬 _${emp.explanation}_\n\n`;
    if (emp.matchedSkills?.length) {
      reply += `✅ **Compétences couvertes (${emp.matchedSkills.length}) :**\n`;
      emp.matchedSkills.forEach((s: string) => { reply += `  • ${s}\n`; });
    }
    if (emp.missingSkills?.length) {
      reply += `\n❌ **Compétences manquantes (${emp.missingSkills.length}) :**\n`;
      emp.missingSkills.forEach((s: string) => { reply += `  • ${s}\n`; });
    }
    if (emp.details?.length) {
      reply += `\n📋 **Détail par compétence :**\n`;
      emp.details.forEach((d: any) => {
        const ok     = d.meets_minimum ? '✅' : '⚠️';
        const empLbl = d.emp_label || (d.employee_level >= 0 ? `Niveau ${d.employee_level}` : 'Non renseigné');
        const reqLbl = d.req_label || `Niveau ${d.required_level}`;
        if (d.matched_with && d.matched_with !== d.intitule) {
          reply += `  ${ok} ${d.intitule} (≈ ${d.matched_with}, sim: ${d.similarity}%) — ${empLbl} (requis : ${reqLbl})\n`;
        } else {
          reply += `  ${ok} ${d.intitule} — ${empLbl} (requis : ${reqLbl})\n`;
        }
      });
    }
    reply += `\n📚 ${emp.totalCompetences} compétence${emp.totalCompetences !== 1 ? 's' : ''} validée${emp.totalCompetences !== 1 ? 's' : ''} au total.`;
    return reply;
  }

  private buildMissingReply(list: any[], keywords: string[], activityTitle?: string): string {
    const ctx         = activityTitle ? ` pour "${activityTitle}"` : '';
    const withMissing = list.filter(e => e.missingSkills?.length > 0);
    if (withMissing.length === 0) return `Tous les candidats couvrent l'ensemble des compétences requises${ctx}.`;

    const relevant = keywords.length > 0
      ? withMissing.filter(e => e.missingSkills.some((s: string) => keywords.some(kw => s.toLowerCase().includes(kw))))
      : withMissing;

    if (relevant.length === 0) return `Aucun candidat ne manque les compétences recherchées.`;

    let reply = `**Compétences manquantes${ctx} :**\n\n`;
    relevant.forEach(e => {
      const missing = keywords.length > 0
        ? e.missingSkills.filter((s: string) => keywords.some(kw => s.toLowerCase().includes(kw)))
        : e.missingSkills;
      reply += `**${e.employeeName}** (score ${e.score}%)\n`;
      missing.forEach((s: string) => { reply += `  ❌ ${s}\n`; });
      reply += '\n';
    });
    return reply.trim();
  }

  private buildBackupReply(list: any[], activityTitle?: string): string {
    const backups = list.filter(e => e.status === 'Backup');
    const ctx     = activityTitle ? ` pour "${activityTitle}"` : '';
    if (backups.length === 0) return `Aucun candidat backup dans la liste${ctx}.`;
    let reply = `**Candidats backup${ctx} (${backups.length}) :**\n\n`;
    backups.forEach(e => { reply += `**${e.rank}. ${e.employeeName}** — ${e.score}%\n   _${e.explanation}_\n\n`; });
    return reply.trim();
  }

  private buildListReply(list: any[], activityTitle?: string): string {
    const ctx = activityTitle ? ` — ${activityTitle}` : '';
    let reply = `**Liste des candidats recommandés${ctx} :**\n\n`;
    list.forEach(e => {
      const badge = e.status === 'Selected' ? '✅ Sélectionné' : '🔄 Backup';
      reply += `**#${e.rank} ${e.employeeName}** · ${e.score}% · ${badge}\n   _${e.explanation}_\n\n`;
    });
    return reply.trim();
  }

  private buildReply(top: any[], keywords: string[], topN: number, prioritization: string): string {
    if (top.length === 0) return 'Aucun employé avec des compétences validées ne correspond à cette requête.';
    const kwDisplay = keywords.length > 0 ? `"${keywords.slice(0, 4).join(', ')}"` : 'toutes compétences';
    let reply = `**Top ${Math.min(topN, top.length)} — ${kwDisplay}**\n`;
    reply += `Contexte : ${CTX_LABEL[prioritization] || prioritization}\n\n`;
    top.forEach((emp, i) => {
      const total    = emp.competences.length;
      const topComps = emp.competences
        .sort((a: any, b: any) =>
          (b.hierarchie_eval >= 0 ? b.hierarchie_eval : b.auto_eval) -
          (a.hierarchie_eval >= 0 ? a.hierarchie_eval : a.auto_eval),
        )
        .slice(0, 3)
        .map((c: any) => c.intitule);
      reply += `**${i + 1}. ${emp.employee_name}** (score IA: ${emp.computedScore})`;
      if (emp.matched?.length > 0) reply += ` ✓ *${emp.matched.slice(0, 2).join(', ')}*`;
      reply += `\n   ${total} compétence${total > 1 ? 's' : ''} validée${total > 1 ? 's' : ''} — Top: ${topComps.join(', ')}\n`;
    });
    reply += `\n*Score basé sur niveau × contexte ${prioritization} × similarité sémantique.*`;
    return reply;
  }

  private findEmployeeByName(msg: string, list: any[]): any | null {
    return list.find(e => {
      const name = (e.employeeName || '').toLowerCase();
      return name.split(/\s+/).some((part: string) => part.length > 2 && msg.includes(part));
    }) ?? null;
  }
}
