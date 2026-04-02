require('dotenv/config');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGODB_URI ||
  'mongodb+srv://dhiahaddeji:dhia10@pi-db.0hzx0p2.mongodb.net/magharibeya?retryWrites=true&w=majority&appName=PI-DB';

const UserSchema = new mongoose.Schema({
  name: String, firstName: String, lastName: String,
  matricule: String, telephone: String,
  email: { type: String, unique: true },
  password: String, date_embauche: Date,
  departement_id: String, manager_id: String,
  status: String, en_ligne: Boolean, role: String,
  mustChangePassword: Boolean, passwordExpiresAt: Date,
  isProfileComplete: Boolean, githubId: String,
  photoUrl: String, cvUrl: String,
}, { timestamps: true });

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connecté à MongoDB');

  const User = mongoose.model('User', UserSchema);

  // Vérifier s'il existe un SUPERADMIN
  const superAdmin = await User.findOne({ role: 'SUPERADMIN' });
  if (superAdmin) {
    console.log('✅ SUPERADMIN déjà existant :', superAdmin.email);
    await mongoose.disconnect();
    return;
  }

  // L'email existe mais avec un autre rôle → mettre à jour
  const existing = await User.findOne({ email: 'dhia.haddeji@esprit.tn' });
  const password = await bcrypt.hash('Admin@2026!', 10);

  if (existing) {
    await User.updateOne(
      { email: 'dhia.haddeji@esprit.tn' },
      {
        $set: {
          role: 'SUPERADMIN',
          name: 'Dhia Haddeji',
          firstName: 'Dhia',
          lastName: 'Haddeji',
          password,
          status: 'ACTIVE',
          isProfileComplete: true,
          mustChangePassword: false,
          passwordExpiresAt: null,
          githubId: null,
        }
      }
    );
    console.log('✅ Compte existant mis à jour en SUPERADMIN');
  } else {
    await User.create({
      name: 'Dhia Haddeji', firstName: 'Dhia', lastName: 'Haddeji',
      email: 'dhia.haddeji@esprit.tn',
      password,
      role: 'SUPERADMIN',
      matricule: 'ADMIN001',
      status: 'ACTIVE', en_ligne: false,
      isProfileComplete: true, mustChangePassword: false,
    });
    console.log('✅ SUPERADMIN créé');
  }

  console.log('');
  console.log('   Email    : dhia.haddeji@esprit.tn');
  console.log('   Password : Admin@2026!');
  console.log('   GitHub   : maintenant fonctionnel');
  console.log('');

  await mongoose.disconnect();
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
