/**
 * Download team logos from Sport5 into static/assets/sport5 and rewrite teams.logo_path.
 * Player headshots / shirts are NOT used in the UI and are ignored.
 *
 * Usage: bun run db:localize-assets
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client';

const STATIC_ROOT = resolve(process.cwd(), 'static');
const ASSET_PREFIX = '/assets/sport5';

function toLocal(url: string): string | null {
	if (!url) return null;
	if (url.startsWith(ASSET_PREFIX)) return url;
	try {
		const u = new URL(url);
		if (!u.pathname || u.pathname === '/') return null;
		return `${ASSET_PREFIX}${u.pathname}`;
	} catch {
		return null;
	}
}

function diskPath(localUrl: string) {
	return join(STATIC_ROOT, localUrl.replace(/^\//, ''));
}

async function download(url: string, dest: string) {
	if (existsSync(dest) && statSync(dest).size > 200) return true;
	mkdirSync(dirname(dest), { recursive: true });
	const res = await fetch(url, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
			Referer: 'https://www.sport5.co.il/',
			Accept: 'image/*'
		}
	});
	if (!res.ok) {
		console.warn(`FAIL ${res.status} ${url}`);
		return false;
	}
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length < 200) return false;
	writeFileSync(dest, buf);
	return true;
}

async function main() {
	const { db, client } = createDb();
	try {
		const rows = await db.execute(sql`
			SELECT id, logo_path AS u FROM teams
			WHERE logo_path IS NOT NULL AND (logo_path LIKE 'http%' OR logo_path LIKE '/assets/sport5/%')
		`);
		const list = rows as unknown as { id: number; u: string }[];
		let ok = 0;
		for (const r of list) {
			let remote = r.u;
			if (remote.startsWith('/assets/sport5')) {
				remote = 'https://www.sport5.co.il' + remote.slice('/assets/sport5'.length);
			}
			const local = toLocal(remote.startsWith('http') ? remote : r.u);
			if (!local) continue;
			const dest = diskPath(local);
			const success = await download(remote, dest);
			if (!success) continue;
			await db.execute(sql`UPDATE teams SET logo_path = ${local}, shirt_path = NULL WHERE id = ${r.id}`);
			await db.execute(sql`
				UPDATE players SET team_logo_path = ${local}, image_path = NULL, team_shirt_path = NULL
				WHERE team_id = ${r.id}
			`);
			await db.execute(sql`
				UPDATE player_snapshots SET team_logo_path = ${local}, image_path = NULL, team_shirt_path = NULL
				WHERE team_id = ${r.id}
			`);
			ok++;
			console.log(`logo team ${r.id} → ${local}`);
		}
		console.log(`Done: ${ok} team logos localized (player photos skipped)`);
	} finally {
		await client.end({ timeout: 5 });
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
