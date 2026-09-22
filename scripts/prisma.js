/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

// Load .env BEFORE Prisma runs
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// The committed prisma/schema.prisma targets PostgreSQL (production), while the
// local sandbox runs SQLite (db/custom.db). When DATABASE_URL is a file: URL,
// transparently point Prisma at the SQLite schema so local boots never hit the
// P1012 provider/URL mismatch. Production (postgres:// URL) is unaffected.

// Forward args to prisma CLI
const { execSync } = require('child_process');
const args = process.argv.slice(2);

const dbUrl = process.env.DATABASE_URL || '';
const localSchema = path.resolve(__dirname, '../prisma/schema.local.prisma');
if (dbUrl.startsWith('file:') && fs.existsSync(localSchema)) {
  args.push('--schema', localSchema);
}

const command = args.join(' ');
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const destructiveCommand = /(^|\s)(migrate\s+reset|db\s+push)(\s|$)/.test(command);

if (isProduction && destructiveCommand) {
  console.error('Refusing destructive Prisma command in production. Use a reviewed migration through the deployment workflow.');
  process.exit(2);
}

try {
  execSync(`npx prisma ${command}`, {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });
} catch (error) {
  process.exit(error.status || 1);
}
