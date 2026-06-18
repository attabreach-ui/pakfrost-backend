const { spawnSync } = require('child_process');

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL is not set; skipping database schema deploy.');
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runPrisma(args) {
  return spawnSync(npx, ['prisma', ...args], {
    stdio: 'inherit',
    shell: false,
  });
}

const migrate = runPrisma(['migrate', 'deploy']);
if (migrate.status === 0) {
  process.exit(0);
}

console.warn('Prisma migrate deploy failed; falling back to prisma db push.');
const push = runPrisma(['db', 'push', '--skip-generate']);
process.exit(push.status ?? 1);
