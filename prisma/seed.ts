import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where:  { username: 'admin' },
    update: {},
    create: {
      username:     'admin',
      passwordHash,
      name:         'Admin',
      role:         'admin',
      isActive:     true,
    },
  });
  console.log(`✓ Admin user created: ${admin.username}`);

  // Initialize doc counter
  await prisma.docCounter.upsert({
    where:  { id: 'main' },
    update: {},
    create: { id: 'main', igpSeq: 0, ogpSeq: 0 },
  });
  console.log('✓ Doc counter initialized');

  console.log('✅ Seed complete!');
  console.log('\n  Login with:');
  console.log('  username: admin');
  console.log('  password: admin123');
  console.log('\n  ⚠ Change the password immediately after first login!\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
