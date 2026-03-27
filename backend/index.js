const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { getJson } = require('serpapi');
const {
	checkRequiredSchema,
	createPool,
	readEnvValue,
	toDatabaseHttpResponse,
} = require('./lib/db');

const PORT = Number(process.env.PORT || 3001);
const MAX_REVIEW_TITLE = 120;
const MAX_REVIEW_BODY = 4000;
const MAX_COMMENT_BODY = 1000;

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const backendPackageJsonPath = path.join(__dirname, 'package.json');

const pool = createPool();
const app = express();

app.disable('x-powered-by');
app.set('etag', false);
app.set('trust proxy', 1);
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
		const missing = await checkRequiredSchema(pool);
		if (missing.length > 0) {
			return res.status(503).json({
				ok: false,
				error: 'db_schema_incomplete',
				reason: 'missing_schema_objects',
				missing,
			});
		}

		return res.json({ ok: true });
	} catch (err) {
		const dbResponse = toDatabaseHttpResponse(err, { includeOk: true });
		if (dbResponse) {
			return res.status(dbResponse.status).json(dbResponse.body);
		}

		return res.status(500).json({ ok: false, error: 'server_error' });
	}
});

function isSecureRequest(req) {
	if (req.secure) return true;
	const forwardedProto = req.get('x-forwarded-proto');
	if (!forwardedProto) return false;
	return forwardedProto
		.split(',')
		.map((part) => part.trim().toLowerCase())
		.includes('https');
}

function getSessionCookieOptions(req) {
	return {
		httpOnly: true,
		sameSite: 'strict',
		secure: isSecureRequest(req),
		maxAge: 1000 * 60 * 60 * 24 * 7,
	};
}

function sanitizeText(input, maxLength) {
	if (typeof input !== 'string') return '';
	const normalized = input.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	return normalized.slice(0, maxLength);
}

function parseReviewId(value) {
	const reviewId = String(value || '').trim();
	if (!/^[0-9a-f-]{36}$/i.test(reviewId)) return null;
	return reviewId;
}

function parseRepoMeta() {
	try {
		const root = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		const backend = JSON.parse(fs.readFileSync(backendPackageJsonPath, 'utf8'));
		return {
			projectName: root.name || 'project1',
			rootScripts: root.scripts || {},
			backendName: backend.name || 'project1-backend',
			backendScripts: backend.scripts || {},
		};
	} catch {
		return {
			projectName: 'project1',
			rootScripts: {},
			backendName: 'project1-backend',
			backendScripts: {},
		};
	}
}

const repoMeta = parseRepoMeta();

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
		const email = sanitizeText(req.body?.email, 320).toLowerCase();
		const password = String(req.body?.password || '');
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
		const email = sanitizeText(req.body?.email, 320).toLowerCase();
		const password = String(req.body?.password || '');
		if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

		const ip = req.ip;
		const ua = req.get('user-agent') || null;

		const { rows } = await pool.query('SELECT * FROM app.login($1, $2, $3, $4)', [email, password, ip, ua]);
		if (!rows[0]) return res.status(401).json({ error: 'invalid_credentials' });

		const { user_id, session_id, session_token, expires_at } = rows[0];

		res.cookie('session_token', session_token, getSessionCookieOptions(req));

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
		res.clearCookie('session_token', {
			httpOnly: true,
			sameSite: 'strict',
			secure: isSecureRequest(req),
		});
		return res.json({ ok: true });
	} catch (err) {
		return next(err);
	}
});

app.get('/api/meta/repo', (req, res) => {
	return res.json({
		repo: repoMeta,
		stack: {
			frontend: 'Vanilla HTML/CSS/JS',
			backend: 'Node.js + Express',
			database: 'PostgreSQL (Supabase or local)',
			crawler: 'SerpAPI YouTube engine',
		},
	});
});

app.post('/api/games/resolve', async (req, res, next) => {
	try {
		const { name } = req.body || {};
		if (!name || String(name).trim().length === 0) return res.status(400).json({ error: 'game_name_required' });

		const gameName = String(name).trim();
		const gameIdRows = await pool.query('SELECT app.get_or_create_game($1) AS game_id', [gameName]);
		const gameId = gameIdRows.rows[0].game_id;
		const userId = await getUserIdFromRequest(req);
		const searchRows = await pool.query('SELECT app.log_game_search($1, $2, $3, $4) AS search_id', [
			gameName,
			userId,
			req.ip,
			req.get('user-agent') || null,
		]);
		const searchId = searchRows.rows[0]?.search_id || null;

		const gameRows = await pool.query('SELECT id, name, created_at FROM app.games WHERE id = $1', [gameId]);
		const game = gameRows.rows[0];

		const reviewsRows = await pool.query('SELECT * FROM app.list_reviews($1, 20)', [gameId]);

		let authenticated = false;
		let myReview = null;
		if (userId) {
			authenticated = true;
			const my = await pool.query(
				'SELECT id AS review_id, rating, title, body, created_at, updated_at FROM app.reviews WHERE game_id = $1 AND user_id = $2',
				[gameId, userId]
			);
			myReview = my.rows[0] || null;
		}

		return res.json({
			game,
			reviews: reviewsRows.rows,
			authenticated,
			myReview,
			search: {
				search_id: searchId,
				searched_at: new Date().toISOString(),
				searched_by: userId || null,
			},
		});
	} catch (err) {
		return next(err);
	}
});

app.get('/api/games/thread', async (req, res, next) => {
	try {
		const gameName = sanitizeText(req.query?.name, 120);
		if (!gameName) return res.status(400).json({ error: 'game_name_required' });

		const gameRows = await pool.query('SELECT id, name, created_at FROM app.games WHERE name = $1', [gameName]);
		const game = gameRows.rows[0];
		if (!game) {
			return res.status(404).json({ error: 'game_not_found' });
		}

		const reviewRows = await pool.query('SELECT * FROM app.list_reviews($1, 50)', [game.id]);
		const reviews = reviewRows.rows;

		const withComments = await Promise.all(
			reviews.map(async (review) => {
				const comments = await pool.query('SELECT * FROM app.list_review_comments($1, 100)', [review.review_id]);
				return {
					...review,
					comments: comments.rows,
				};
			})
		);

		return res.json({
			game,
			reviews: withComments,
			thread_generated_at: new Date().toISOString(),
		});
	} catch (err) {
		return next(err);
	}
});

app.post('/api/reviews', requireAuth, async (req, res, next) => {
	try {
		const game_id = String(req.body?.game_id || '').trim();
		const rating = Number(req.body?.rating);
		const title = sanitizeText(req.body?.title, MAX_REVIEW_TITLE);
		const body = sanitizeText(req.body?.body, MAX_REVIEW_BODY);
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

app.post('/api/reviews/:reviewId/comments', requireAuth, async (req, res, next) => {
	try {
		const reviewId = parseReviewId(req.params.reviewId);
		if (!reviewId) return res.status(400).json({ error: 'invalid_review_id' });

		const body = sanitizeText(req.body?.body, MAX_COMMENT_BODY);
		if (!body) return res.status(400).json({ error: 'comment_body_required' });

		const reviewExists = await pool.query('SELECT id FROM app.reviews WHERE id = $1', [reviewId]);
		if (!reviewExists.rows[0]) return res.status(404).json({ error: 'review_not_found' });

		const inserted = await pool.query('SELECT app.add_review_comment($1, $2, $3) AS comment_id', [
			req.userId,
			reviewId,
			body,
		]);

		return res.status(201).json({ comment_id: inserted.rows[0]?.comment_id || null });
	} catch (err) {
		return next(err);
	}
});

app.get('/api/crawler/youtube', async (req, res, next) => {
	try {
		const apiKey = readEnvValue('SERPAPI_KEY');
		if (!apiKey) return res.status(501).json({ error: 'serpapi_not_configured' });

		const q = String(req.query.q || '').trim();
		if (!q) return res.status(400).json({ error: 'q_required' });

		const searchQuery = `${q} game review gameplay opinion`;
		const json = await getJson({
			engine: 'youtube',
			search_query: searchQuery,
			hl: 'en',
			gl: 'us',
			api_key: apiKey,
		});

		const videos = Array.isArray(json?.video_results) ? json.video_results : [];
		const trimmed = videos.slice(0, 6).map((v) => ({
			title: v?.title || null,
			link: v?.link || null,
			channel: v?.channel?.name || v?.channel || null,
			duration: v?.duration || null,
			views: v?.views || null,
			published_date: v?.published_date || null,
			thumbnail: v?.thumbnail?.static || v?.thumbnail || null,
			extracted_by: 'serpapi',
			position: v?.position || null,
		}));

		try {
			const userId = await getUserIdFromRequest(req);
			const searchRows = await pool.query('SELECT app.log_game_search($1, $2, $3, $4) AS search_id', [
				q,
				userId,
				req.ip,
				req.get('user-agent') || null,
			]);
			const searchId = searchRows.rows[0]?.search_id;
			if (searchId) {
				await pool.query('SELECT app.store_video_results($1, $2, $3::jsonb) AS stored_count', [
					searchId,
					'serpapi',
					JSON.stringify(trimmed),
				]);
			}
		} catch {
			// Crawler persistence must not block user-facing responses.
		}

		return res.json({ query: searchQuery, videos: trimmed });
	} catch (err) {
		if (typeof err === 'string' && err.toLowerCase().includes('invalid api key')) {
			return res.status(502).json({ error: 'serpapi_invalid_key' });
		}
		if (typeof err?.message === 'string' && err.message.toLowerCase().includes('invalid api key')) {
			return res.status(502).json({ error: 'serpapi_invalid_key' });
		}
		return next(err);
	}
});

app.use((err, req, res, next) => {
	const message = typeof err?.message === 'string' ? err.message : 'server_error';
	const code = err?.code;
	const dbResponse = toDatabaseHttpResponse(err);
	if (dbResponse) {
		return res.status(dbResponse.status).json(dbResponse.body);
	}
	if (code === 'P0001') {
		// Raised exception from our SQL functions
		return res.status(400).json({ error: message });
	}
	return res.status(500).json({ error: 'server_error' });
});

const server = app.listen(PORT, () => {
	const address = server.address();
	const boundPort = typeof address === 'object' && address ? address.port : PORT;
	// eslint-disable-next-line no-console
	console.log(`Backend running on http://localhost:${boundPort}`);
});

server.on('error', (err) => {
	if (err && err.code === 'EADDRINUSE') {
		// eslint-disable-next-line no-console
		console.error(`Port ${PORT} is already in use.`);
		// eslint-disable-next-line no-console
		console.error('Stop the other server, or start this one with a different port (example: PORT=3001 npm start).');
		process.exit(1);
	}
	throw err;
});
