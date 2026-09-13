import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/** Standalone DB client for CLI scripts (loads DATABASE_URL from env / .env). */
export function createDb(url = process.env.DATABASE_URL) {
	if (!url) throw new Error('DATABASE_URL is not set');
	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema });
	return { db, client };
}
