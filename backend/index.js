
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const { getJson } = require('serpapi');

const PORT = Number(process.env.PORT || 3000);

function createPool() {
	if (process.env.DATABASE_URL) {
		return new Pool({ connectionString: process.env.DATABASE_URL });
	}

	return new Pool({
		host: process.env.PGHOST || 'localhost',
		port: Number(process.env.PGPORT || 5432),
		user: process.env.PGUSER || 'postgres',
		password: process.env.PGPASSWORD || '',
		database: process.env.PGDATABASE || 'postgres',
	});
}

const pool = createPool();
const app = express();

app.disable('x-powered-by');
app.set('etag', false);
app.use(express.json({ limit: '250kb' }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
	res.set('Cache-Control', 'no-store');
	return next();
});

const frontDir = path.join(__dirname, '..', 'front page');
const cssDir = path.join(__dirname, '..', 'css');
app.use(express.static(frontDir));
app.use('/css', express.static(cssDir));

app.get('/', (req, res) => {
	res.sendFile(path.join(frontDir, 'index.html'));
});

app.get('/api/health', async (req, res) => {
	try {
		await pool.query('SELECT 1');
		res.json({ ok: true });
	} catch (err) {
		res.status(500).json({ ok: false, error: 'db_unreachable' });
	}
});

async function getUserIdFromRequest(req) {
	const token = req.cookies?.session_token;
	if (!token) return null;

	const { rows } = await pool.query('SELECT app.verify_session($1) AS user_id', [token]);
	const userId = rows?.[0]?.user_id || null;
	return userId;
}

async function requireAuth(req, res, next) {
	try {
		const userId = await getUserIdFromRequest(req);
		if (!userId) return res.status(401).json({ error: 'unauthorized' });
		req.userId = userId;
		return next();
	} catch (err) {
		return next(err);
	}
}

app.get('/api/me', async (req, res, next) => {
	try {
		const userId = await getUserIdFromRequest(req);
		if (!userId) return res.json({ authenticated: false });

		const { rows } = await pool.query('SELECT id, email FROM app.users WHERE id = $1', [userId]);
		if (!rows[0]) return res.json({ authenticated: false });

		return res.json({ authenticated: true, user: { id: rows[0].id, email: rows[0].email } });
	} catch (err) {
		return next(err);
	}
});

app.post('/api/auth/register', async (req, res, next) => {
	try {
		const { email, password } = req.body || {};
		if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

		const { rows } = await pool.query('SELECT app.signup($1, $2) AS user_id', [email, password]);
		return res.status(201).json({ user_id: rows[0].user_id });
	} catch (err) {
		// unique_violation
		if (err && err.code === '23505') {
			return res.status(409).json({ error: 'email_already_exists' });
		}
		return next(err);
	}
});

app.post('/api/auth/login', async (req, res, next) => {
	try {
		const { email, password } = req.body || {};
		if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

		const ip = req.ip;
		const ua = req.get('user-agent') || null;

		const { rows } = await pool.query('SELECT * FROM app.login($1, $2, $3, $4)', [email, password, ip, ua]);
		if (!rows[0]) return res.status(401).json({ error: 'invalid_credentials' });

		const { user_id, session_id, session_token, expires_at } = rows[0];

		res.cookie('session_token', session_token, {
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: 1000 * 60 * 60 * 24 * 7,
		});

		return res.json({ user_id, session_id, expires_at });
	} catch (err) {
		return next(err);
	}
});

app.post('/api/auth/logout', async (req, res, next) => {
	try {
		const token = req.cookies?.session_token;
		if (token) {
			await pool.query(
				"UPDATE app.sessions SET revoked_at = now() WHERE token_hash = digest($1, 'sha256') AND revoked_at IS NULL",
				[token]
			);
		}
		res.clearCookie('session_token');
		return res.json({ ok: true });
	} catch (err) {
		return next(err);
	}
});

app.post('/api/games/resolve', async (req, res, next) => {
	try {
		const { name } = req.body || {};
		if (!name || String(name).trim().length === 0) return res.status(400).json({ error: 'game_name_required' });

		const gameName = String(name).trim();
		const gameIdRows = await pool.query('SELECT app.get_or_create_game($1) AS game_id', [gameName]);
		const gameId = gameIdRows.rows[0].game_id;

		const gameRows = await pool.query('SELECT id, name, created_at FROM app.games WHERE id = $1', [gameId]);
		const game = gameRows.rows[0];

		const reviewsRows = await pool.query('SELECT * FROM app.list_reviews($1, 20)', [gameId]);

		let authenticated = false;
		let myReview = null;
		const userId = await getUserIdFromRequest(req);
		if (userId) {
			authenticated = true;
			const my = await pool.query(
				'SELECT id AS review_id, rating, title, body, created_at, updated_at FROM app.reviews WHERE game_id = $1 AND user_id = $2',
				[gameId, userId]
			);
			myReview = my.rows[0] || null;
		}

		return res.json({ game, reviews: reviewsRows.rows, authenticated, myReview });
	} catch (err) {
		return next(err);
	}
});

app.post('/api/reviews', requireAuth, async (req, res, next) => {
	try {
		const { game_id, rating, title, body } = req.body || {};
		if (!game_id) return res.status(400).json({ error: 'game_id_required' });
		const r = Number(rating);
		if (!Number.isInteger(r) || r < 1 || r > 10) return res.status(400).json({ error: 'rating_must_be_1_to_10' });
		if (!title || !body) return res.status(400).json({ error: 'title_and_body_required' });

		const { rows } = await pool.query('SELECT app.upsert_review($1, $2, $3, $4, $5) AS review_id', [
			req.userId,
			game_id,
			r,
			title,
			body,
		]);

		return res.status(201).json({ review_id: rows[0].review_id });
	} catch (err) {
		return next(err);
	}
});

app.get('/api/crawler/youtube', async (req, res, next) => {
	try {
		const apiKey = process.env.SERPAPI_KEY;
		if (!apiKey) return res.status(501).json({ error: 'serpapi_not_configured' });

		const q = String(req.query.q || '').trim();
		if (!q) return res.status(400).json({ error: 'q_required' });

		const searchQuery = `${q} user reviews`;
		getJson(
			{
				engine: 'youtube',
				search_query: searchQuery,
				api_key: apiKey,
			},
			(json) => {
				const videos = Array.isArray(json?.video_results) ? json.video_results : [];
				const trimmed = videos.slice(0, 6).map((v) => ({
					title: v?.title || null,
					link: v?.link || null,
					channel: v?.channel?.name || v?.channel || null,
					duration: v?.duration || null,
					views: v?.views || null,
					published_date: v?.published_date || null,
					thumbnail: v?.thumbnail?.static || v?.thumbnail || null,
				}));
				return res.json({ query: searchQuery, videos: trimmed });
			}
		);
	} catch (err) {
		return next(err);
	}
});

app.use((err, req, res, next) => {
	const message = typeof err?.message === 'string' ? err.message : 'server_error';
	const code = err?.code;
	if (code === 'P0001') {
		// Raised exception from our SQL functions
		return res.status(400).json({ error: message });
	}
	return res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
	// eslint-disable-next-line no-console
	console.log(`Backend running on http://localhost:${PORT}`);
});

