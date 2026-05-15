/**
 * Script: createAdminUser.js
 * Run with: node scripts/createAdminUser.js
 *
 * Creates an admin user in MongoDB for the BrandIn Agent to authenticate with.
 * Run this ONCE from the server/ directory.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const ADMIN_EMAIL    = 'admin@brandy.app';
const ADMIN_PASSWORD = 'BrandyAdmin@2025!';  // Change this before production!
const ADMIN_FULLNAME = 'Brandy Admin';

async function createAdmin() {
  const { DB_Name } = await import('../src/constant.js');
  let uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing");

  // Replicate server's DB connection logic
  if (uri.includes('?')) {
    const [base, query] = uri.split('?');
    const separator = base.endsWith('/') ? '' : '/';
    uri = `${base}${separator}${DB_Name}?${query}`;
  } else {
    const separator = uri.endsWith('/') ? '' : '/';
    uri = `${uri}${separator}${DB_Name}`;
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB (DB: ' + DB_Name + ')');

  // Dynamically import User model (ESM)
  const { default: User } = await import('../src/modules/user/user.model.js');

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`♻️  Updating existing admin user: ${ADMIN_EMAIL}`);
    existing.password = ADMIN_PASSWORD;
    existing.role = 'admin'; // Ensure role is correct
    await existing.save();
    console.log('✅ Admin password updated successfully!');
  } else {
    const admin = new User({
      fullname: ADMIN_FULLNAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      isVerified: true,
      profileComplete: true,
    });
    await admin.save();
    console.log('✅ New admin user created successfully!');
  }

  console.log('');
  console.log('🎉 Admin user created successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Role:     admin`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('🔑 NEXT STEP — Get your admin JWT token:');
  console.log('   curl -X POST http://localhost:8000/api/v1/auth/login \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log(`     -d \'{"email":"${ADMIN_EMAIL}","password":"${ADMIN_PASSWORD}"}\' | grep accessToken`);
  console.log('');
  console.log('   Then paste the token into BrandIn/.env as BRANDY_ADMIN_TOKEN');

  await mongoose.disconnect();
}

createAdmin().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
