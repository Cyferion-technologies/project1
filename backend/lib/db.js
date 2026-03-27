const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const REQUIRED_SCHEMA_OBJECTS = [
	{
		kind: 'schema',
		name: 'app',
		sql: "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'app') AS present",
	},
	{
		kind: 'table',
		name: 'app.users',
		sql: "SELECT to_regclass('app.users') IS NOT NULL AS present",
	},
	{
		kind: 'table',
		name: 'app.sessions',
		sql: "SELECT to_regclass('app.sessions') IS NOT NULL AS present",
	},
	{
		kind: 'table',
		name: 'app.games',
		sql: "SELECT to_regclass('app.games') IS NOT NULL AS present",
	},
	{
		kind: 'table',
		name: 'app.reviews',
		sql: "SELECT to_regclass('app.reviews') IS NOT NULL AS present",
	},
	{
		kind: 'table',
		name: 'app.review_comments',
		sql: "SELECT to_regclass('app.review_comments') IS NOT NULL AS present",
	},
	{
		kind: 'table',
		name: 'app.game_searches',
		sql: "SELECT to_regclass('app.game_searches') IS NOT NULL AS present",
	},
	{
		kind: 'table',
		name: 'app.video_search_results',
		sql: "SELECT to_regclass('app.video_search_results') IS NOT NULL AS present",
	},
	{
		kind: 'function',
		name: 'app.signup',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'signup') AS present",
	},
	{
		kind: 'function',
		name: 'app.login',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'login') AS present",
	},
	{
		kind: 'function',
		name: 'app.verify_session',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'verify_session') AS present",
	},
	{
		kind: 'function',
		name: 'app.get_or_create_game',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'get_or_create_game') AS present",
	},
	{
		kind: 'function',
		name: 'app.upsert_review',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'upsert_review') AS present",
	},
	{
		kind: 'function',
		name: 'app.list_reviews',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'list_reviews') AS present",
	},
	{
		kind: 'function',
		name: 'app.add_review_comment',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'add_review_comment') AS present",
	},
	{
		kind: 'function',
		name: 'app.list_review_comments',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'list_review_comments') AS present",
	},
	{
		kind: 'function',
		name: 'app.log_game_search',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'log_game_search') AS present",
	},
	{
		kind: 'function',
		name: 'app.store_video_results',
		sql: "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'store_video_results') AS present",
	},
];

function readIntEnv(name, fallback) {
	const value = Number(readEnvValue(name, String(fallback)));
	return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readEnvValue(name, fallback = '') {
	return String(process.env[name] ?? fallback)
		.trim()
		.replace(/^['"]|['"]$/g, '');
}

function parseDatabaseUrl() {
	const value = readEnvValue('DATABASE_URL');
	if (!value) return null;

	try {
		return { value, url: new URL(value) };
	} catch {
		return { value, url: null };
	}
}

function detectProvider(hostname) {
	const host = String(hostname || '').toLowerCase();
	if (!host) return 'local_postgres';
	if (host.includes('supabase.co') || host.includes('supabase.com')) return 'supabase';
	return 'postgres';
}

function resolveSslConfig() {
	const sslMode = readEnvValue('PGSSLMODE').toLowerCase();
	if (sslMode === 'disable') return false;
	if (sslMode === 'require') return { rejectUnauthorized: false };

	const parsed = parseDatabaseUrl();
	if (parsed?.url && detectProvider(parsed.url.hostname) === 'supabase') {
		return { rejectUnauthorized: false };
	}

	return false;
}

function getDatabaseTarget() {
	const parsed = parseDatabaseUrl();
	if (parsed) {
		const host = parsed.url?.hostname || 'invalid_database_url';
		const port = parsed.url?.port ? Number(parsed.url.port) : 5432;
		const database = parsed.url?.pathname ? parsed.url.pathname.replace(/^\/+/, '') : null;
		const provider = detectProvider(host);

		return {
			configured: true,
			via: 'DATABASE_URL',
			provider,
			host,
			port,
			database,
			pooled: port === 6543,
			ssl: resolveSslConfig() ? 'enabled' : 'disabled',
			valid: Boolean(parsed.url),
		};
	}

	const host = readEnvValue('PGHOST', 'localhost') || 'localhost';
	const port = Number(readEnvValue('PGPORT', '5432') || 5432);
	return {
		configured: true,
		via: 'PG*',
		provider: detectProvider(host),
		host,
		port,
		database: readEnvValue('PGDATABASE', 'postgres') || 'postgres',
		pooled: false,
		ssl: resolveSslConfig() ? 'enabled' : 'disabled',
		valid: true,
	};
}

function getPublicDatabaseSummary(target = getDatabaseTarget()) {
	return {
		provider: target.provider,
		via: target.via,
		database: target.database,
		pooled: Boolean(target.pooled),
		ssl: target.ssl,
	};
}

function createPool() {
	const ssl = resolveSslConfig();
	const connectionString = readEnvValue('DATABASE_URL');
	const commonPoolConfig = {
		ssl,
		max: readIntEnv('PGPOOL_MAX', 10),
		idleTimeoutMillis: readIntEnv('PG_IDLE_TIMEOUT_MS', 30000),
		connectionTimeoutMillis: readIntEnv('PG_CONNECT_TIMEOUT_MS', 5000),
	};
	if (connectionString) {
		return new Pool({
			connectionString,
			...commonPoolConfig,
		});
	}

	return new Pool({
		host: readEnvValue('PGHOST', 'localhost') || 'localhost',
		port: Number(readEnvValue('PGPORT', '5432') || 5432),
		user: readEnvValue('PGUSER', 'postgres') || 'postgres',
		password: readEnvValue('PGPASSWORD', ''),
		database: readEnvValue('PGDATABASE', 'postgres') || 'postgres',
		...commonPoolConfig,
	});
}

function classifyDatabaseError(err) {
	if (!err) return null;

	const code = String(err.code || '').trim();
	const message = String(err.message || '').toLowerCase();

	if (message.includes('allow_list')) {
		return {
			status: 503,
			error: 'db_unreachable',
			reason: 'supabase_allow_list_blocked',
			detail:
				'Supabase rejected this machine IP. Add the current client IP to the Supabase network allow-list or switch backend/.env to a reachable local Postgres instance.',
		};
	}

	if (code === 'ECONNREFUSED' || message.includes('connect econnrefused')) {
		return {
			status: 503,
			error: 'db_unreachable',
			reason: 'connection_refused',
			detail: 'Postgres refused the connection. Verify the host, port, and that the database server is running.',
		};
	}

	if (code === 'ENOTFOUND' || message.includes('getaddrinfo enotfound')) {
		return {
			status: 503,
			error: 'db_unreachable',
			reason: 'dns_lookup_failed',
			detail: 'The database hostname could not be resolved. Check DATABASE_URL or PGHOST.',
		};
	}

	if (code === 'ETIMEDOUT' || message.includes('timed out')) {
		return {
			status: 503,
			error: 'db_unreachable',
			reason: 'connection_timed_out',
			detail: 'The database connection timed out. Check network access, firewalls, and Supabase allow-list settings.',
		};
	}

	if (code === '28P01' || code === '28000' || message.includes('password authentication failed')) {
		return {
			status: 503,
			error: 'db_unreachable',
			reason: 'authentication_failed',
			detail: 'The database rejected the configured credentials. Verify DATABASE_URL or the PGUSER/PGPASSWORD values.',
		};
	}

	if (code === '3D000') {
		return {
			status: 503,
			error: 'db_unreachable',
			reason: 'database_not_found',
			detail: 'The configured database does not exist on the target server.',
		};
	}

	if (code === '3F000' || code === '42P01' || code === '42883') {
		return {
			status: 503,
			error: 'db_schema_incomplete',
			reason: 'missing_schema_objects',
			detail: 'The database is reachable, but required schema objects are missing. Run npm run db:init against the active database.',
		};
	}

	return null;
}

function toDatabaseHttpResponse(err, options = {}) {
	const diagnosis = classifyDatabaseError(err);
	if (!diagnosis) return null;

	const body = {
		error: diagnosis.error,
		reason: diagnosis.reason,
		detail: diagnosis.detail,
		database: getPublicDatabaseSummary(),
	};

	if (options.includeOk === true) {
		body.ok = false;
	}

	return {
		status: diagnosis.status,
		body,
	};
}

async function checkRequiredSchema(pool) {
	const missing = [];

	for (const check of REQUIRED_SCHEMA_OBJECTS) {
		const { rows } = await pool.query(check.sql);
		if (!rows[0]?.present) {
			missing.push({ kind: check.kind, name: check.name });
		}
	}

	return missing;
}

module.exports = {
	REQUIRED_SCHEMA_OBJECTS,
	checkRequiredSchema,
	classifyDatabaseError,
	createPool,
	getDatabaseTarget,
	getPublicDatabaseSummary,
	readEnvValue,
	resolveSslConfig,
	toDatabaseHttpResponse,
};
