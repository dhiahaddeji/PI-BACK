import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

// ── Semantic aliases: any variant → canonical French label ────────────────────
const ALIASES: Record<string, string> = {
  // JavaScript ecosystem
  'js':                       'JavaScript',
  'javascript':               'JavaScript',
  'ts':                       'TypeScript',
  'typescript':               'TypeScript',
  'node':                     'Node.js',
  'nodejs':                   'Node.js',
  'node.js':                  'Node.js',
  'react':                    'React',
  'reactjs':                  'React',
  'react.js':                 'React',
  'vue':                      'Vue.js',
  'vuejs':                    'Vue.js',
  'angular':                  'Angular',
  'next':                     'Next.js',
  'nextjs':                   'Next.js',
  'nest':                     'NestJS',
  'nestjs':                   'NestJS',
  // Python
  'py':                       'Python',
  'python':                   'Python',
  // Java
  'java':                     'Java',
  'spring':                   'Spring Boot',
  'spring boot':              'Spring Boot',
  'springboot':               'Spring Boot',
  // Data / AI
  'ml':                       'Machine Learning',
  'machine learning':         'Machine Learning',
  'dl':                       'Deep Learning',
  'deep learning':            'Deep Learning',
  'ai':                       'Intelligence Artificielle',
  'ia':                       'Intelligence Artificielle',
  'nlp':                      'NLP',
  'data science':             'Data Science',
  'datascience':              'Data Science',
  'tensorflow':               'TensorFlow',
  'pytorch':                  'PyTorch',
  'scikit':                   'Scikit-learn',
  'sklearn':                  'Scikit-learn',
  'pandas':                   'Pandas',
  'numpy':                    'NumPy',
  // Databases
  'sql':                      'SQL',
  'mongo':                    'MongoDB',
  'mongodb':                  'MongoDB',
  'postgres':                 'PostgreSQL',
  'postgresql':               'PostgreSQL',
  'mysql':                    'MySQL',
  'redis':                    'Redis',
  // DevOps / Cloud
  'docker':                   'Docker',
  'k8s':                      'Kubernetes',
  'kubernetes':               'Kubernetes',
  'aws':                      'AWS',
  'azure':                    'Azure',
  'gcp':                      'Google Cloud Platform',
  'ci cd':                    'CI/CD',
  'cicd':                     'CI/CD',
  'ci/cd':                    'CI/CD',
  'devops':                   'DevOps',
  'git':                      'Git',
  'linux':                    'Linux',
  // Frontend
  'html':                     'HTML/CSS',
  'css':                      'HTML/CSS',
  'html css':                 'HTML/CSS',
  'html/css':                 'HTML/CSS',
  // Other tech
  'c++':                      'C++',
  'cpp':                      'C++',
  'c#':                       'C#',
  'csharp':                   'C#',
  'php':                      'PHP',
  'flutter':                  'Flutter',
  'swift':                    'Swift',
  'kotlin':                   'Kotlin',
  'api':                      'API REST',
  'rest':                     'API REST',
  'rest api':                 'API REST',
  'graphql':                  'GraphQL',
  'excel':                    'Excel',
  'power bi':                 'Power BI',
  'powerbi':                  'Power BI',
  'tableau':                  'Tableau',
  // Business
  'project management':       'Gestion de projet',
  'gestion de projet':        'Gestion de projet',
  'agile':                    'Méthode Agile',
  'scrum':                    'Scrum',
  'audit':                    'Audit',
  'assurance':                'Assurance',
  'finance':                  'Finance',
  'comptabilite':             'Comptabilité',
  'comptabilité':             'Comptabilité',
  'marketing':                'Marketing digital',
  // Soft skills
  'communication':            'Communication',
  'leadership':               'Leadership',
  'team work':                'Travail en équipe',
  'teamwork':                 'Travail en équipe',
  'travail d\'équipe':        'Travail en équipe',
  'autonomie':                'Autonomie',
  'adaptabilite':             'Adaptabilité',
  'adaptabilité':             'Adaptabilité',
  'creativite':               'Créativité',
  'créativité':               'Créativité',
  'rigueur':                  'Rigueur',
  'organisation':             'Organisation',
  'problem solving':          'Résolution de problèmes',
  'résolution de problèmes':  'Résolution de problèmes',
};

// ── Experience year extraction patterns ──────────────────────────────────────
const EXP_PATTERNS: RegExp[] = [
  // "5 ans de Python" / "3 years of JavaScript"
  /(\d+)\s*\+?\s*(?:ans?|années?|years?)\s+(?:d[e']|of|avec|en|sur)\s+([a-z][a-z0-9#\+\.\s]{1,30}?)(?=[,;\n]|$)/gi,
  // "Python: 5 ans" / "Java : 3 years"
  /([a-z][a-z0-9#\+\.\s]{1,20}?)\s*:\s*(\d+)\s*\+?\s*(?:ans?|années?|years?)/gi,
  // "expérience de 5 ans en React"
  /expérience\s+(?:de\s+)?(\d+)\s*\+?\s*(?:ans?|années?|years?)\s+en\s+([a-z][a-z0-9#\+\.\s]{1,30}?)(?=[,;\n]|$)/gi,
];

@Injectable()
export class NlpService {
  private readonly embeddingCache = new Map<string, number[]>();
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ── Normalize a skill name: resolve aliases, capitalize properly ──────────
  normalize(skill: string): string {
    const trimmed = skill.trim();
    const lower   = trimmed.toLowerCase();

    // Direct alias lookup
    if (ALIASES[lower]) return ALIASES[lower];

    // Prefix alias lookup (e.g. "js developer" → "JavaScript")
    for (const [alias, canonical] of Object.entries(ALIASES)) {
      if (lower.startsWith(alias + ' ') || lower === alias) return canonical;
    }

    // Default: Title Case
    return trimmed.replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Deduplicate skills by normalized name ─────────────────────────────────
  deduplicate<T extends { intitule: string }>(skills: T[]): T[] {
    const seen = new Map<string, T>();
    for (const s of skills) {
      const canonical = this.normalize(s.intitule);
      const key       = canonical.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { ...s, intitule: canonical } as T);
      }
    }
    return Array.from(seen.values());
  }

  // ── Extract years of experience per skill from raw text ───────────────────
  extractExperience(text: string): Record<string, number> {
    const result: Record<string, number> = {};

    for (const pattern of EXP_PATTERNS) {
      const re = new RegExp(pattern.source, 'gi');
      let match: RegExpExecArray | null;

      while ((match = re.exec(text)) !== null) {
        const raw = match.slice(1);
        // pattern 1 & 3: (years, skill) — pattern 2: (skill, years)
        let yearsStr: string, skillStr: string;
        if (/^\d/.test(raw[0])) {
          [yearsStr, skillStr] = raw;
        } else {
          [skillStr, yearsStr] = raw;
        }

        const years = parseInt(yearsStr, 10);
        if (isNaN(years) || years > 40 || !skillStr) continue;

        const key = this.normalize(skillStr.trim()).toLowerCase();
        if (key.length > 2) result[key] = Math.max(result[key] || 0, years);
      }
    }

    return result;
  }

  // ── Semantic similarity between two skill labels ──────────────────────────
  async semanticSimilarity(a: string, b: string): Promise<number> {
    const normA = this.normalize(a).toLowerCase();
    const normB = this.normalize(b).toLowerCase();

    if (normA === normB)                          return 1.0;
    if (normA.includes(normB) || normB.includes(normA)) return 0.88;

    // Try embeddings first
    const [vecA, vecB] = await Promise.all([
      this.getEmbedding(normA),
      this.getEmbedding(normB),
    ]);

    if (vecA.length > 0 && vecB.length > 0) {
      return this.cosineSimilarity(vecA, vecB);
    }

    // Trigram fallback when embeddings unavailable
    return this.trigramSimilarity(normA, normB);
  }

  // ── OpenAI embeddings (cached, 2s timeout) ───────────────────────────────
  async getEmbedding(text: string): Promise<number[]> {
    const key = text.toLowerCase().trim();
    if (this.embeddingCache.has(key)) return this.embeddingCache.get(key)!;

    try {
      const apiCall = this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: key,
      });
      // Abort after 2 s — fall back to trigram similarity if OpenAI is slow/unavailable
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('embedding timeout')), 2000),
      );
      const res    = await Promise.race([apiCall, timeout]) as any;
      const vector = res.data[0].embedding as number[];
      this.embeddingCache.set(key, vector);
      return vector;
    } catch {
      return [];
    }
  }

  // ── Cosine similarity ─────────────────────────────────────────────────────
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  }

  // ── Trigram similarity fallback ───────────────────────────────────────────
  private trigramSimilarity(a: string, b: string): number {
    const ngrams = (s: string): Set<string> => {
      const set    = new Set<string>();
      const padded = `  ${s}  `;
      for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
      return set;
    };
    const setA = ngrams(a);
    const setB = ngrams(b);
    let inter  = 0;
    for (const g of setA) if (setB.has(g)) inter++;
    return (2 * inter) / (setA.size + setB.size + 1e-10);
  }
}
