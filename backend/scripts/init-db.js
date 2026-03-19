const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

function resolveSslConfig() {
	const sslMode = String(process.env.PGSSLMODE || '').toLowerCase();
	if (sslMode === 'disable') return false;
	if (sslMode === 'require') return { rejectUnauthorized: false };
	if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase.co')) {
		return { rejectUnauthorized: false };
	}
	return false;
}

function createPool() {
	const ssl = resolveSslConfig();
	if (process.env.DATABASE_URL) {
		return new Pool({
			connectionString: process.env.DATABASE_URL,
			ssl,
		});
	}

	return new Pool({
		host: process.env.PGHOST || 'localhost',
		port: Number(process.env.PGPORT || 5432),
		user: process.env.PGUSER || 'postgres',
		password: process.env.PGPASSWORD || '',
		database: process.env.PGDATABASE || 'postgres',
		ssl,
	});
}

async function run() {
	const pool = createPool();
	const sqlFiles = [
		path.join(__dirname, '..', '..', 'data', 'supabase.sql'),
		path.join(__dirname, '..', '..', 'data', 'supabase-reviews.sql'),
	];

	try {
		for (const file of sqlFiles) {
			const sql = fs.readFileSync(file, 'utf8');
			await pool.query(sql);
			console.log('Applied:', path.basename(file));
		}

		console.log('Database initialization completed.');
	} catch (err) {
		console.error('Database initialization failed:', err.message);
		process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

run();
