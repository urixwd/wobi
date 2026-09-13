/**
 * Dump the local WOBI Postgres database to SQL (for git / backup).
 *
 * Usage:
 *   bun run db:dump
 *   bun run db:dump -- --out=./db/dumps/custom.sql
 *
 * Writes:
 *   db/dumps/latest.sql          (always overwritten)
 *   db/dumps/wobi-YYYYMMDD-HHMM.sql  (dated copy)
 */
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv: string[]) {
	let out: string | null = null;
	for (const a of argv) {
		if (a.startsWith('--out=')) out = a.slice(6);
	}
	return { out };
}

function pad(n: number) {
	return String(n).padStart(2, '0');
}

function stamp(d = new Date()) {
	return (
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
		`-${pad(d.getHours())}${pad(d.getMinutes())}`
	);
}

function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set (use bun --env-file=.env)');

	const { out } = parseArgs(process.argv.slice(2));
	const dumpsDir = resolve(process.cwd(), 'db/dumps');
	mkdirSync(dumpsDir, { recursive: true });

	const dated = resolve(dumpsDir, `wobi-${stamp()}.sql`);
	const latest = resolve(dumpsDir, 'latest.sql');
	const target = out ? resolve(process.cwd(), out) : dated;
	mkdirSync(dirname(target), { recursive: true });

	const header =
		`-- WOBI Postgres dump\n` +
		`-- generated: ${new Date().toISOString()}\n` +
		`-- source: DATABASE_URL (credentials redacted)\n` +
		`-- restore: psql "$DATABASE_URL" -f ${out ? out : 'db/dumps/latest.sql'}\n\n`;

	const tmp = `${target}.tmp`;
	const result = spawnSync(
		'pg_dump',
		[
			url,
			'--no-owner',
			'--no-acl',
			'--clean',
			'--if-exists',
			'--format=plain',
			`--file=${tmp}`
		],
		{ encoding: 'utf8' }
	);

	if (result.status !== 0) {
		const err = (result.stderr || result.stdout || 'pg_dump failed').trim();
		throw new Error(err);
	}

	const body = readFileSync(tmp, 'utf8');
	writeFileSync(target, header + body, 'utf8');
	spawnSync('rm', ['-f', tmp]);

	if (!out) {
		copyFileSync(target, latest);
		console.log(`Wrote ${target}`);
		console.log(`Wrote ${latest}`);
	} else {
		console.log(`Wrote ${target}`);
	}

	const bytes = Buffer.byteLength(header + body);
	console.log(`Size: ${(bytes / 1024).toFixed(1)} KiB`);
}

main();
