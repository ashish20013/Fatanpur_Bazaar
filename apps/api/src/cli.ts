import 'reflect-metadata';
import { join } from 'node:path';
import { loadEnv } from './config/env';
import { createKnex } from './database/knex.provider';
import { runMigrations } from './database/migrate';

/**
 * Operator CLI (no HTTP):
 *   node dist/cli.js migrate                 apply SQL migrations
 *   node dist/cli.js seed [--demo]           base data (+ demo users/orders)
 *   node dist/cli.js seed-admin --phone=9XXXXXXXXX --name="Ashish"   FIRST admin only (needs SETUP_TOKEN)
 *   node dist/cli.js set-role --phone=9XXXXXXXXX --role=ADMIN|SUPERVISOR|DELIVERY_BOY [--name="…"]   (needs SETUP_TOKEN)
 *   node dist/cli.js cron                    the ONE hPanel cron entry (every 5 min)
 *   node dist/cli.js queue                   drain the job queue once
 *   node dist/cli.js vapid                   print a new Web Push VAPID key pair
 */
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'vapid') {
    const webpush = (await import('web-push')).default;
    const k = webpush.generateVAPIDKeys();
    console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`);
    return;
  }
  const env = loadEnv();
  if (cmd === 'migrate') {
    const db = createKnex(env, { multipleStatements: true });
    try {
      const applied = await runMigrations(db, join(__dirname, 'database', 'migrations'), (m) => console.log(m));
      console.log(applied.length ? `✅ applied: ${applied.join(', ')}` : '✅ database already up to date');
    } finally {
      await db.destroy();
    }
    return;
  }
  if (cmd === 'seed') {
    const db = createKnex(env);
    try {
      const { seedAll } = await import('./database/seeds/run.js');
      await seedAll(db, { demo: process.argv.includes('--demo'), storagePath: env.STORAGE_PATH, publicUploadUrl: env.PUBLIC_UPLOAD_URL, log: (m) => console.log(m) });
    } finally {
      await db.destroy();
    }
    return;
  }
  if (cmd === 'seed-admin') {
    // Chicken-and-egg (matrix §8): the FIRST admin comes from here, never from HTTP.
    if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 16) throw new Error('SETUP_TOKEN (16+ chars) must be set in the environment for this one-time command');
    const phone = (arg('phone') ?? '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const name = arg('name') ?? 'Admin';
    if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('--phone must be a 10-digit Indian mobile number');
    const db = createKnex(env);
    try {
      const { bootstrapAdmin } = await import('./database/seeds/admin.js');
      const r = await bootstrapAdmin(db, phone, name);
      console.log(`✅ ADMIN created (#${r.id}). Now REMOVE SETUP_TOKEN from .env. Login: phone ${phone} + OTP.`);
    } finally {
      await db.destroy();
    }
    return;
  }
  if (cmd === 'set-role') {
    // Launch-time fix-up of staff numbers from the server shell. Same SETUP_TOKEN gate as seed-admin.
    if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 16) throw new Error('SETUP_TOKEN (16+ chars) must be set in the environment for this command');
    const phone = (arg('phone') ?? '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const role = (arg('role') ?? '').toUpperCase();
    if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('--phone must be a 10-digit Indian mobile number');
    if (role !== 'ADMIN' && role !== 'SUPERVISOR' && role !== 'DELIVERY_BOY') throw new Error('--role must be ADMIN, SUPERVISOR or DELIVERY_BOY (customers are created by signing up)');
    const db = createKnex(env);
    try {
      const { setStaffRole } = await import('./database/seeds/set-role.js');
      const r = await setStaffRole(db, phone, role, arg('name'));
      console.log(`✅ ${phone}: ${r.from ?? 'new user'} → ${role} (#${r.id}). Old sessions revoked — log in again with OTP.`);
    } finally {
      await db.destroy();
    }
    return;
  }
  if (cmd === 'doctor') {
    // Read-only health check; writes DIAGNOSTIC.txt at the repo root so the whole answer to
    // "why does it look wrong?" travels as one file instead of a conversation.
    const { runDoctor } = await import('./database/doctor.js');
    const { writeFileSync } = await import('node:fs');
    const db = createKnex(env);
    let lines;
    try {
      lines = await runDoctor(db, env);
    } finally {
      await db.destroy();
    }
    const mark = { ok: '  ok  ', warn: ' WARN ', fail: ' FAIL ', info: '      ' };
    const body = lines.map((l) => `${mark[l.level]}${l.msg}`).join('\n');
    const fails = lines.filter((l) => l.level === 'fail').length;
    const warns = lines.filter((l) => l.level === 'warn').length;
    const head = `Fatanpur Bazaar — diagnostic\n${new Date().toISOString()}\n${'='.repeat(60)}\n`;
    const foot = `\n${'='.repeat(60)}\n${fails} FAIL, ${warns} WARN\n`;
    const out = join(process.cwd(), '..', '..', 'DIAGNOSTIC.txt');
    writeFileSync(out, head + body + foot, 'utf8');
    console.log(head + body + foot);
    console.log(`written to ${out}`);
    process.exitCode = fails ? 1 : 0;
    return;
  }
  if (cmd === 'cron' || cmd === 'queue') {
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('./app.module.js');
    const { CronService } = await import('./modules/jobs/cron.service.js');
    const { QueueService } = await import('./modules/jobs/queue.service.js');
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    try {
      if (cmd === 'queue') console.log(JSON.stringify(await app.get(QueueService).work(50)));
      else console.log(JSON.stringify(await app.get(CronService).tick()));
    } finally {
      await app.close();
    }
    return;
  }
  console.log('usage: cli.js doctor | migrate | seed [--demo] | seed-admin --phone= --name= | set-role --phone= --role= [--name=] | cron | queue | vapid');
  process.exitCode = 2;
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
