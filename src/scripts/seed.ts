import { connectDatabase } from '../config/database';
import { initModels, sequelize, User } from '../models';
import { hashPassword } from '../utils/jwt';
import { DEFAULT_CATEGORIES, Category } from '../models/Category';
import { env } from '../config/env';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@expenseflow.app';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const ADMIN_NAME = 'Admin User';

async function seed() {
  await connectDatabase();
  initModels();
  await sequelize.sync({ alter: env.NODE_ENV === 'development' });

  const existing = await User.findOne({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    await existing.update({ role: 'admin' });
    console.log('Admin user already exists — role set to admin.');
    console.log(`Email:    ${ADMIN_EMAIL}`);
    console.log(`Password: (unchanged — use your existing password)`);
    console.log(`         Or set SEED_ADMIN_PASSWORD and delete the user to re-seed.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const user = await User.create({
    email: ADMIN_EMAIL,
    passwordHash,
    name: ADMIN_NAME,
    role: 'admin',
    emailVerified: true,
    onboardingCompleted: true,
    country: 'India',
    currency: 'INR',
  });

  await Category.bulkCreate(
    DEFAULT_CATEGORIES.map((cat, index) => ({
      userId: user.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      sortOrder: index,
    }))
  );

  console.log('Seed complete.');
  console.log('');
  console.log('Admin login (admin dashboard + API):');
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log('');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
