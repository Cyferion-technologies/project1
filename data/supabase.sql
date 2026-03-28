BEGIN;

-- Core extensions for auth/data modeling:
-- pgcrypto -> UUID generation, hashing, salts; citext -> case-insensitive email uniqueness/lookups.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app;

-- Shared BEFORE UPDATE trigger function used by multiple tables so `updated_at`
-- is always refreshed automatically and application code does not need to manage it.
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$;

-- Core identity table for app accounts. Stores hashed password only, account flags,
-- and timestamps needed for auditability/login tracking.
CREATE TABLE IF NOT EXISTS app.users (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email citext NOT NULL UNIQUE,
	password_hash text NOT NULL,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	last_login_at timestamptz
);

-- Create users-table trigger once (idempotent) to maintain `updated_at` on edits.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgname = 'trg_users_updated_at'
	) THEN
		CREATE TRIGGER trg_users_updated_at
		BEFORE UPDATE ON app.users
		FOR EACH ROW
		EXECUTE FUNCTION app.set_updated_at();
	END IF;
END;
$$;

-- Session table for cookie-based auth. The raw token is never persisted; only
-- a SHA-256 digest is stored, reducing impact if DB contents are exposed.
CREATE TABLE IF NOT EXISTS app.sessions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
	token_hash bytea NOT NULL UNIQUE,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz,
	ip inet,
	user_agent text
);

-- Indexes supporting frequent session operations: user lookups, expiry scans,
-- and revoked/non-revoked filtering for auth validation.
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON app.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON app.sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked_at ON app.sessions(revoked_at);

-- Signup function validates required fields and password length, then inserts a
-- user row with a salted hash (bcrypt via `crypt(..., gen_salt('bf', ...))`).
CREATE OR REPLACE FUNCTION app.signup(p_email citext, p_password text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
	v_user_id uuid;
BEGIN
	IF p_email IS NULL OR length(trim(p_email::text)) = 0 THEN
		RAISE EXCEPTION 'email is required';
	END IF;

	IF p_password IS NULL OR length(p_password) < 10 THEN
		RAISE EXCEPTION 'password must be at least 10 characters';
	END IF;

	INSERT INTO app.users (email, password_hash)
	VALUES (p_email, crypt(p_password, gen_salt('bf', 12)))
	RETURNING id INTO v_user_id;

	RETURN v_user_id;
END;
$$;

-- Credential-check helper used by login. Returns matching user id only when the
-- account is active and supplied password matches stored hash.
CREATE OR REPLACE FUNCTION app.authenticate(p_email citext, p_password text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
	SELECT u.id
	FROM app.users u
	WHERE u.is_active = true
		AND u.email = p_email
		AND u.password_hash = crypt(p_password, u.password_hash)
$$;

-- Login workflow function: authenticates credentials, generates random session token,
-- stores only token hash + metadata, updates last-login timestamp, returns token to caller.
CREATE OR REPLACE FUNCTION app.login(
	p_email citext,
	p_password text,
	p_ip inet DEFAULT NULL,
	p_user_agent text DEFAULT NULL,
	p_ttl interval DEFAULT interval '7 days'
)
RETURNS TABLE (
	user_id uuid,
	session_id uuid,
	session_token text,
	expires_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
	v_user_id uuid;
	v_session_id uuid;
	v_token text;
	v_token_hash bytea;
	v_expires_at timestamptz;
BEGIN
	v_user_id := app.authenticate(p_email, p_password);
	IF v_user_id IS NULL THEN
		RETURN;
	END IF;

	v_token := encode(gen_random_bytes(32), 'hex');
	v_token_hash := digest(v_token, 'sha256');
	v_expires_at := now() + p_ttl;

	INSERT INTO app.sessions (user_id, token_hash, expires_at, ip, user_agent)
	VALUES (v_user_id, v_token_hash, v_expires_at, p_ip, p_user_agent)
	RETURNING id INTO v_session_id;

	UPDATE app.users
	SET last_login_at = now()
	WHERE id = v_user_id;

	user_id := v_user_id;
	session_id := v_session_id;
	session_token := v_token;
	expires_at := v_expires_at;
	RETURN NEXT;
END;
$$;

-- Marks session as revoked. Predicate keeps operation idempotent so repeated calls
-- do not alter state after first successful revoke.
CREATE OR REPLACE FUNCTION app.revoke_session(p_session_id uuid)
RETURNS void
LANGUAGE sql
AS $$
	UPDATE app.sessions
	SET revoked_at = now()
	WHERE id = p_session_id
		AND revoked_at IS NULL
$$;

-- Session validation function used by API middleware. Accepts plaintext token,
-- compares hashed token, and enforces both non-revoked and non-expired constraints.
CREATE OR REPLACE FUNCTION app.verify_session(p_session_token text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
	SELECT s.user_id
	FROM app.sessions s
	WHERE s.revoked_at IS NULL
		AND s.expires_at > now()
		AND s.token_hash = digest(p_session_token, 'sha256')
$$;

-- Canonical game registry so review/search features can reference stable game ids.
CREATE TABLE IF NOT EXISTS app.games (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name citext NOT NULL UNIQUE,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- User reviews for games. Unique constraint enforces one review per user+game pair,
-- while still allowing updates to rating/title/body.
CREATE TABLE IF NOT EXISTS app.reviews (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	game_id uuid NOT NULL REFERENCES app.games(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
	rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 10),
	title text NOT NULL,
	body text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT uq_reviews_game_user UNIQUE (game_id, user_id)
);

-- Create reviews-table trigger once (idempotent) to keep `updated_at` synchronized.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgname = 'trg_reviews_updated_at'
	) THEN
		CREATE TRIGGER trg_reviews_updated_at
		BEFORE UPDATE ON app.reviews
		FOR EACH ROW
		EXECUTE FUNCTION app.set_updated_at();
	END IF;
END;
$$;

-- Composite index for game-scoped review feeds sorted by newest first.
CREATE INDEX IF NOT EXISTS idx_reviews_game_id_created_at ON app.reviews(game_id, created_at DESC);

-- Upsert-like helper for game names. Trims input, inserts when missing, otherwise
-- reuses existing row and returns stable game id for downstream workflows.
CREATE OR REPLACE FUNCTION app.get_or_create_game(p_name citext)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
	v_game_id uuid;
BEGIN
	IF p_name IS NULL OR length(trim(p_name::text)) = 0 THEN
		RAISE EXCEPTION 'game name is required';
	END IF;

	INSERT INTO app.games (name)
	VALUES (trim(p_name::text)::citext)
	ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
	RETURNING id INTO v_game_id;

	RETURN v_game_id;
END;
$$;

-- Review upsert function with server-side validation. Inserts a new review or
-- updates existing row on (game_id, user_id) conflict and returns review id.
CREATE OR REPLACE FUNCTION app.upsert_review(
	p_user_id uuid,
	p_game_id uuid,
	p_rating smallint,
	p_title text,
	p_body text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
	v_review_id uuid;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'user_id is required';
	END IF;
	IF p_game_id IS NULL THEN
		RAISE EXCEPTION 'game_id is required';
	END IF;
	IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
		RAISE EXCEPTION 'title is required';
	END IF;
	IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
		RAISE EXCEPTION 'body is required';
	END IF;

	INSERT INTO app.reviews (game_id, user_id, rating, title, body)
	VALUES (p_game_id, p_user_id, p_rating, trim(p_title), trim(p_body))
	ON CONFLICT (game_id, user_id) DO UPDATE
	SET rating = EXCLUDED.rating,
		title = EXCLUDED.title,
		body = EXCLUDED.body
	RETURNING id INTO v_review_id;

	RETURN v_review_id;
END;
$$;

-- Read model for review feeds. Joins users to derive masked author label,
-- enforces bounded limit, and orders by newest reviews first.
CREATE OR REPLACE FUNCTION app.list_reviews(p_game_id uuid, p_limit int DEFAULT 20)
RETURNS TABLE (
	review_id uuid,
	rating smallint,
	title text,
	body text,
	created_at timestamptz,
	updated_at timestamptz,
	author text
)
LANGUAGE sql
STABLE
AS $$
	SELECT
		r.id AS review_id,
		r.rating,
		r.title,
		r.body,
		r.created_at,
		r.updated_at,
		(
			CASE
				WHEN position('@' in u.email::text) > 1
				THEN left(split_part(u.email::text, '@', 1), 1) || '***'
				ELSE 'user'
			END
		) AS author
	FROM app.reviews r
	JOIN app.users u ON u.id = r.user_id
	WHERE r.game_id = p_game_id
	ORDER BY r.created_at DESC
	LIMIT GREATEST(1, LEAST(p_limit, 50))
$$;

COMMIT;
