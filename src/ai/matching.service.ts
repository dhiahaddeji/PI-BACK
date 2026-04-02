import { Injectable } from '@nestjs/common';
import { NlpService } from './nlp.service';
import { EVAL_TO_SCORE } from '../competences/competence.schema';

// ── Context weights: how much each eval level contributes per learning goal ──
export const CONTEXT_WEIGHTS: Record<string, Record<number, number>> = {
  upskilling:    { 0: 1.5, 1: 1.3, 2: 1.0, 3: 0.7, 4: 0.4 },
  consolidation: { 0: 0.5, 1: 0.9, 2: 1.5, 3: 1.2, 4: 0.8 },
  expertise:     { 0: 0.2, 1: 0.5, 2: 0.8, 3: 1.3, 4: 1.8 },
};

export const CTX_LABEL: Record<string, string> = {
  upskilling:    '🟡 Upskilling (profils à développer)',
  consolidation: '🔵 Consolidation (profils intermédiaires)',
  expertise:     '🟢 Expertise (profils avancés)',
};

// Minimum similarity score to count a skill as matching
const SIMILARITY_THRESHOLD = 0.72;

@Injectable()
export class MatchingService {
  constructor(private readonly nlp: NlpService) {}

  // ── Score employees against free-text keywords (used in AI chat) ──────────
  async scoreEmployees(
    employees: any[],
    keywords: string[],
    prioritization: string,
  ): Promise<any[]> {
    const ctxW = CONTEXT_WEIGHTS[prioritization] || CONTEXT_WEIGHTS.expertise;

    const scored = await Promise.all(
      employees.map(async (emp) => {
        let score = 0;
        const matched: string[] = [];

        for (const comp of emp.competences) {
          const evalScore = comp.hierarchie_eval >= 0 ? comp.hierarchie_eval : comp.auto_eval;
          const ctxWeight = ctxW[evalScore] ?? 1;

          if (keywords.length === 0) {
            // No filter: small universal score
            score += (EVAL_TO_SCORE[evalScore] ?? 0) * ctxWeight * 0.5;
          } else {
            for (const kw of keywords) {
              const sim = await this.nlp.semanticSimilarity(comp.intitule, kw);
              if (sim >= SIMILARITY_THRESHOLD) {
                score += (EVAL_TO_SCORE[evalScore] ?? 25) * ctxWeight * sim;
                matched.push(comp.intitule);
                break;
              }
            }
          }
        }

        return { ...emp, computedScore: Math.round(score), matched };
      }),
    );

    return scored.sort((a, b) => b.computedScore - a.computedScore);
  }

  // ── Match employees against required competences (used in matchActivity) ──
  async matchCompetences(
    employees: any[],
    requiredCompetences: any[],
    prioritization: string,
  ): Promise<any[]> {
    const ctxW     = CONTEXT_WEIGHTS[prioritization] || CONTEXT_WEIGHTS.expertise;
    const maxScore = requiredCompetences.length * 4 * 1.8;

    const scored = await Promise.all(
      employees.map(async (emp) => {
        let score = 0;
        const details: any[] = [];

        for (const req of requiredCompetences) {
          let bestMatch: any   = null;
          let bestSim: number  = 0;

          // Find the employee competence with highest semantic similarity
          for (const comp of emp.competences) {
            const sim = await this.nlp.semanticSimilarity(comp.intitule, req.intitule);
            if (sim > bestSim) {
              bestSim  = sim;
              bestMatch = comp;
            }
          }

          if (bestMatch && bestSim >= SIMILARITY_THRESHOLD) {
            const evalScore = bestMatch.hierarchie_eval >= 0
              ? bestMatch.hierarchie_eval
              : bestMatch.auto_eval;
            const ctxWeight = ctxW[evalScore] ?? 1;
            const pts       = evalScore * ctxWeight * bestSim; // similarity-weighted pts
            score += pts;

            details.push({
              intitule:       req.intitule,
              matched_with:   bestMatch.intitule,
              similarity:     Math.round(bestSim * 100),
              employee_level: evalScore,
              required_level: req.niveau_min ?? 2,
              meets_minimum:  evalScore >= (req.niveau_min ?? 2),
              score:          Math.round(pts),
            });
          } else {
            details.push({
              intitule:       req.intitule,
              matched_with:   null,
              similarity:     Math.round(bestSim * 100),
              employee_level: -1,
              required_level: req.niveau_min ?? 2,
              meets_minimum:  false,
              score:          0,
            });
          }
        }

        const pct = maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;
        return { ...emp, score: pct, rank_score: score, details };
      }),
    );

    return scored.sort((a, b) => b.rank_score - a.rank_score);
  }

  // ── Detect prioritization context from free text ──────────────────────────
  detectPrioritization(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('upskill') || t.includes('formation') || t.includes('apprendre') || t.includes('débutant')) return 'upskilling';
    if (t.includes('consolid') || t.includes('intermédiaire') || t.includes('renforcer')) return 'consolidation';
    return 'expertise';
  }

  // ── Extract N from "top 3", "les 5 meilleurs", etc. ─────────────────────
  extractTopN(text: string): number {
    const m = text.match(/(?:top|les?|show me|donne(?:-moi)?)\s+(\d+)/i);
    if (m) return Math.min(parseInt(m[1], 10), 20);
    return 5;
  }

  // ── Extract skill keywords from free text ─────────────────────────────────
  extractKeywords(text: string): string[] {
    const stopwords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'et', 'ou',
      'pour', 'avec', 'sur', 'dans', 'qui', 'que', 'est', 'sont', 'ont',
      'the', 'a', 'an', 'of', 'in', 'for', 'with', 'and', 'or', 'is',
      'trouve', 'trouver', 'cherche', 'chercher', 'besoin', 'avoir',
      'meilleur', 'meilleurs', 'top', 'liste', 'montre', 'donne',
      'employé', 'employés', 'personne', 'personnes', 'expert', 'experts',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s\+\#\.]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }
}
