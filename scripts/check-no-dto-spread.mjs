#!/usr/bin/env node
// SECURITY_AUDIT §1: user-creation code must never spread a DTO (`...dto`, `...body`, `...input`).
// One spread line can let a client-supplied `role` reach the INSERT. CI fails on any match.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['apps/api/src/modules/auth', 'apps/api/src/modules/users', 'apps/api/src/modules/staff'];
const BAD = /\.\.\.\s*(dto|body|input|req\.body|payload|data)\b/;
let failures = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (BAD.test(line)) {
          console.error(`${p}:${i + 1}: forbidden spread in user-creation module → ${line.trim()}`);
          failures++;
        }
      });
    }
  }
}
for (const r of ROOTS) {
  try { walk(r); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
if (failures) process.exit(1);
console.log('check-no-dto-spread: OK');
