import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const STATIC_ROOT = resolve(process.cwd(), 'static');
const ASSET_PREFIX = '/assets/sport5';

/** Map a Sport5 logo URL to a local static path (does not download). */
export function remoteToLocalUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	if (url.startsWith('/assets/')) return url;
	if (!/^https?:\/\//i.test(url)) return url;
	try {
		const u = new URL(url);
		if (!u.pathname || u.pathname === '/') return null;
		return `${ASSET_PREFIX}${u.pathname}`;
	} catch {
		return url;
	}
}

/** Download a team logo into static/ and return the local `/assets/...` URL. */
export async function ensureLocalLogo(url: string | null | undefined): Promise<string | null> {
	if (!url) return null;
	if (url.startsWith(ASSET_PREFIX)) return url;
	if (!/^https?:\/\//i.test(url)) return url;
	const local = remoteToLocalUrl(url);
	if (!local) return null;
	const dest = join(STATIC_ROOT, local.replace(/^\//, ''));
	if (!(existsSync(dest) && statSync(dest).size > 200)) {
		mkdirSync(dirname(dest), { recursive: true });
		try {
			const res = await fetch(url, {
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
					Referer: 'https://www.sport5.co.il/',
					Accept: 'image/*'
				}
			});
			if (!res.ok) {
				console.warn(`logo download ${res.status} ${url}`);
				return null;
			}
			const buf = Buffer.from(await res.arrayBuffer());
			if (buf.length < 200) return null;
			writeFileSync(dest, buf);
		} catch (e) {
			console.warn(`logo download err ${url}`, e);
			return null;
		}
	}
	return local;
}
