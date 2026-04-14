/**
 * Script de création du compte Super Administrateur initial.
 * Exécuter une seule fois : npm run seed
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const existing = await usersService.findSuperAdmin();
  if (existing) {
    console.log('✅ SUPERADMIN déjà existant :', existing.email);
    await app.close();
    return;
  }

  await usersService.create({
    name: 'Dhia Haddeji',
    firstName: 'Dhia',
    lastName: 'Haddeji',
    email: 'dhia.haddeji@esprit.tn',
    password: 'Admin@2026!',
    role: 'SUPERADMIN',
    matricule: 'ADMIN001',
    status: 'ACTIVE',
    isProfileComplete: true,
    mustChangePassword: false,
  });

  console.log('✅ SUPERADMIN créé : dhia.haddeji@esprit.tn / Admin@2026!');
  await app.close();
}

seed().catch((err) => {
  console.error('❌ Erreur seed :', err.message);
  process.exit(1);
});
