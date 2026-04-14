/**
 * Seed basic test users (1 manager, 3 employees).
 * Run: npm run seed:test-users
 */
import 'dotenv/config';
import { setServers } from 'dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';

const DEFAULT_PASSWORD = process.env.SEED_TEST_PASSWORD || 'Test@2026!';

const SEED_USERS = [
  {
    firstName: 'Manager',
    lastName: 'Test',
    name: 'Manager Test',
    email: 'manager.test@demo.local',
    role: 'MANAGER',
  },
  {
    firstName: 'Employee',
    lastName: 'One',
    name: 'Employee One',
    email: 'employee1@demo.local',
    role: 'EMPLOYEE',
  },
  {
    firstName: 'Employee',
    lastName: 'Two',
    name: 'Employee Two',
    email: 'employee2@demo.local',
    role: 'EMPLOYEE',
  },
  {
    firstName: 'Employee',
    lastName: 'Three',
    name: 'Employee Three',
    email: 'employee3@demo.local',
    role: 'EMPLOYEE',
  },
];

async function seed() {
  // Force public DNS for SRV resolution in local environments.
  setServers(['8.8.8.8', '1.1.1.1']);
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  for (const u of SEED_USERS) {
    const existing = await usersService.findByEmail(u.email);
    if (existing) {
      await usersService.update((existing as any)._id?.toString(), {
        role: u.role,
        status: 'ACTIVE',
        isProfileComplete: true,
        name: u.name,
        firstName: u.firstName,
        lastName: u.lastName,
      });
      console.log(`↺ Updated ${u.role}: ${u.email}`);
      continue;
    }

    const matricule = await usersService.nextMatricule(u.role);
    await usersService.create({
      ...u,
      matricule,
      password: DEFAULT_PASSWORD,
      status: 'ACTIVE',
      isProfileComplete: true,
      mustChangePassword: false,
    });
    console.log(`+ Created ${u.role}: ${u.email} (matricule ${matricule})`);
  }

  console.log(`\nDefault password: ${DEFAULT_PASSWORD}`);
  await app.close();
}

seed().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
