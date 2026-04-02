import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Vérification de la connexion SMTP au démarrage
    this.transporter.verify((err) => {
      if (err) {
        this.logger.error(`❌ SMTP non connecté: ${err.message}`);
        this.logger.error(`   EMAIL_USER=${process.env.EMAIL_USER} | EMAIL_PASS=${process.env.EMAIL_PASS ? 'SET' : 'MISSING'}`);
      } else {
        this.logger.log(`✅ SMTP Gmail connecté — prêt à envoyer des emails`);
      }
    });
  }

  /** Test rapide — envoie un email de test à l'adresse donnée */
  async sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || `"AssurReco" <${process.env.EMAIL_USER}>`,
        to,
        subject: '✅ Test SMTP AssurReco',
        text: 'Si vous lisez ceci, la configuration email fonctionne correctement.',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async sendWelcomeWithCredentials(opts: {
    to: string;
    name: string;
    role: string;
    password: string;
  }) {
    const roleLabel: Record<string, string> = {
      HR: 'Responsable RH',
      MANAGER: 'Manager',
      EMPLOYEE: 'Employé',
      SUPERADMIN: 'Super Administrateur',
    };

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#0b2b4b;padding:28px 32px;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;">🛡️ AssurReco</h1>
          <p style="color:#94a3b8;margin:4px 0 0;">Système de recommandation IA</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#0f172a;margin-top:0;">Bienvenue, ${opts.name} !</h2>
          <p style="color:#334155;">Votre compte <strong>${roleLabel[opts.role] || opts.role}</strong> a été créé sur la plateforme AssurReco.</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:.5px;">Vos identifiants de connexion</p>
            <p style="margin:4px 0;color:#0f172a;"><strong>Email :</strong> ${opts.to}</p>
            <p style="margin:4px 0;color:#0f172a;"><strong>Mot de passe temporaire :</strong>
              <code style="background:#0b2b4b;color:#ffffff;padding:2px 8px;border-radius:4px;font-size:15px;">${opts.password}</code>
            </p>
          </div>

          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;color:#92400e;">
              ⏰ <strong>Ce mot de passe est valable 24 heures.</strong><br>
              Vous devrez le changer dès votre première connexion.
            </p>
          </div>

          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login"
             style="display:inline-block;background:#0b2b4b;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Se connecter maintenant
          </a>

          <p style="margin-top:32px;color:#94a3b8;font-size:12px;">
            Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
          </p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || `"AssurReco" <${process.env.EMAIL_USER}>`,
        to: opts.to,
        subject: '🎉 Votre compte AssurReco a été créé',
        html,
      });
      this.logger.log(`Email envoyé à ${opts.to}`);
    } catch (err) {
      this.logger.error(`Échec envoi email à ${opts.to}: ${err.message}`);
      // Ne pas faire planter la création de compte si l'email échoue
    }
  }
}
