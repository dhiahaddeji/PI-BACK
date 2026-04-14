import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuestionCompetence, QuestionCompetenceDocument } from './question-competence.schema';

const CATALOG_ITEMS = [
  // ─── Savoir (connaissances théoriques) ───────────────────────────────
  { intitule: 'Python',                  type: 'savoir', description: 'Programmation Python' },
  { intitule: 'Java',                    type: 'savoir', description: 'Programmation Java' },
  { intitule: 'JavaScript',             type: 'savoir', description: 'Programmation JavaScript / TypeScript' },
  { intitule: 'SQL',                     type: 'savoir', description: 'Bases de données relationnelles et requêtes SQL' },
  { intitule: 'Machine Learning',        type: 'savoir', description: 'Algorithmes et modèles d\'apprentissage automatique' },
  { intitule: 'Deep Learning',           type: 'savoir', description: 'Réseaux de neurones et apprentissage profond' },
  { intitule: 'NLP',                     type: 'savoir', description: 'Traitement automatique du langage naturel' },
  { intitule: 'Data Science',            type: 'savoir', description: 'Analyse et modélisation de données' },
  { intitule: 'Cloud Computing',         type: 'savoir', description: 'Services cloud (AWS, Azure, GCP)' },
  { intitule: 'Docker',                  type: 'savoir', description: 'Conteneurisation avec Docker' },
  { intitule: 'Kubernetes',              type: 'savoir', description: 'Orchestration de conteneurs' },
  { intitule: 'DevOps',                  type: 'savoir', description: 'Pratiques DevOps et CI/CD' },
  { intitule: 'React',                   type: 'savoir', description: 'Développement frontend avec React' },
  { intitule: 'Node.js',                 type: 'savoir', description: 'Développement backend avec Node.js' },
  { intitule: 'Agile / Scrum',           type: 'savoir', description: 'Méthodologies agiles' },
  { intitule: 'Comptabilité',            type: 'savoir', description: 'Principes comptables et normes IFRS' },
  { intitule: 'Finance d\'entreprise',   type: 'savoir', description: 'Analyse financière et gestion budgétaire' },
  { intitule: 'Audit',                   type: 'savoir', description: 'Audit interne et contrôle de gestion' },
  { intitule: 'Assurance',               type: 'savoir', description: 'Produits et réglementation assurance' },
  { intitule: 'Actuariat',               type: 'savoir', description: 'Modélisation actuarielle et gestion des risques' },
  { intitule: 'Excel avancé',            type: 'savoir', description: 'Formules avancées, tableaux croisés, macros VBA' },
  { intitule: 'Power BI',                type: 'savoir', description: 'Visualisation de données avec Power BI' },
  { intitule: 'Tableau',                 type: 'savoir', description: 'Visualisation de données avec Tableau' },
  { intitule: 'R',                       type: 'savoir', description: 'Statistiques et analyse avec R' },
  { intitule: 'Cybersécurité',           type: 'savoir', description: 'Sécurité des systèmes d\'information' },
  { intitule: 'Réseaux informatiques',   type: 'savoir', description: 'Architecture réseau, protocoles TCP/IP' },
  { intitule: 'Droit des affaires',      type: 'savoir', description: 'Réglementation juridique et contrats' },
  { intitule: 'Marketing digital',       type: 'savoir', description: 'SEO, SEM, réseaux sociaux, analytics' },
  { intitule: 'Gestion des risques',     type: 'savoir', description: 'Identification et mitigation des risques' },
  { intitule: 'Ressources humaines',     type: 'savoir', description: 'Recrutement, GPEC, droit social' },

  // ─── Savoir-faire (compétences pratiques) ────────────────────────────
  { intitule: 'Gestion de projet',       type: 'savoir_faire', description: 'Planification, suivi et livraison de projets' },
  { intitule: 'Développement logiciel',  type: 'savoir_faire', description: 'Conception et développement d\'applications' },
  { intitule: 'Analyse de données',      type: 'savoir_faire', description: 'Exploitation et interprétation de données' },
  { intitule: 'Présentation',            type: 'savoir_faire', description: 'Conception et animation de présentations' },
  { intitule: 'Négociation',             type: 'savoir_faire', description: 'Techniques de négociation commerciale' },
  { intitule: 'Rédaction professionnelle', type: 'savoir_faire', description: 'Rédaction de rapports, notes et synthèses' },
  { intitule: 'Gestion budgétaire',      type: 'savoir_faire', description: 'Élaboration et suivi de budgets' },
  { intitule: 'Résolution de problèmes', type: 'savoir_faire', description: 'Analyse et résolution de problèmes complexes' },
  { intitule: 'Formation / Coaching',    type: 'savoir_faire', description: 'Transmission de compétences et accompagnement' },
  { intitule: 'Veille technologique',    type: 'savoir_faire', description: 'Suivi des évolutions technologiques du secteur' },
  { intitule: 'Modélisation UML',        type: 'savoir_faire', description: 'Conception avec diagrammes UML' },
  { intitule: 'Tests et QA',             type: 'savoir_faire', description: 'Rédaction et exécution de tests logiciels' },
  { intitule: 'Administration système',  type: 'savoir_faire', description: 'Administration Linux/Windows serveurs' },
  { intitule: 'Gestion de la relation client', type: 'savoir_faire', description: 'CRM et fidélisation client' },
  { intitule: 'Reporting',               type: 'savoir_faire', description: 'Production de tableaux de bord et rapports' },

  // ─── Savoir-être (compétences comportementales) ──────────────────────
  { intitule: 'Communication',           type: 'savoir_etre', description: 'Aisance relationnelle et expression claire' },
  { intitule: 'Leadership',              type: 'savoir_etre', description: 'Capacité à motiver et fédérer une équipe' },
  { intitule: 'Travail d\'équipe',       type: 'savoir_etre', description: 'Collaboration et esprit d\'équipe' },
  { intitule: 'Adaptabilité',            type: 'savoir_etre', description: 'Flexibilité face aux changements' },
  { intitule: 'Autonomie',               type: 'savoir_etre', description: 'Capacité à travailler de manière indépendante' },
  { intitule: 'Créativité',              type: 'savoir_etre', description: 'Innovation et pensée créative' },
  { intitule: 'Rigueur',                 type: 'savoir_etre', description: 'Précision, méthode et attention aux détails' },
  { intitule: 'Sens de l\'écoute',       type: 'savoir_etre', description: 'Empathie et écoute active' },
  { intitule: 'Gestion du stress',       type: 'savoir_etre', description: 'Maîtrise de soi sous pression' },
  { intitule: 'Organisation',            type: 'savoir_etre', description: 'Planification et gestion des priorités' },
  { intitule: 'Prise d\'initiative',     type: 'savoir_etre', description: 'Proactivité et sens des responsabilités' },
  { intitule: 'Esprit critique',         type: 'savoir_etre', description: 'Analyse objective et recul' },
  { intitule: 'Curiosité intellectuelle', type: 'savoir_etre', description: 'Appétence pour l\'apprentissage continu' },
  { intitule: 'Confidentialité',         type: 'savoir_etre', description: 'Discrétion et respect de la confidentialité' },
  { intitule: 'Orientation résultats',   type: 'savoir_etre', description: 'Focus sur l\'atteinte des objectifs' },
];

@Injectable()
export class CompetencesSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(CompetencesSeeder.name);

  constructor(
    @InjectModel(QuestionCompetence.name)
    private questionModel: Model<QuestionCompetenceDocument>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.questionModel.countDocuments({ actif: true });
    if (count > 0) {
      this.logger.log(`Catalogue: ${count} compétences déjà présentes — seed ignoré.`);
      return;
    }

    const docs = CATALOG_ITEMS.map(item => ({ ...item, actif: true }));
    await this.questionModel.insertMany(docs);
    this.logger.log(`Catalogue initialisé avec ${docs.length} compétences.`);
  }
}
