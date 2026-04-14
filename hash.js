const bcrypt = require('bcrypt');

async function generateHash() {
  const password = "admin2025!"; // mot de passe que tu veux
  const hash = await bcrypt.hash(password, 10);
  console.log(hash);
}

generateHash();