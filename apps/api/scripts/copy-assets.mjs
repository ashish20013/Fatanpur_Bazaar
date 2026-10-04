// Copies non-TS assets (SQL migrations) next to the compiled JS so `node dist/cli.js migrate` works
// from a deployed artifact that has no src/ folder.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'dist';
const from = 'src/database/migrations';
const to = `${out}/database/migrations`;
if (existsSync(from)) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, filter: (p) => !p.endsWith('.ts') });
}
console.log(`assets → ${to}`);
