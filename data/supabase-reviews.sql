BEGIN;

CREATE SCHEMA IF NOT EXISTS app;

-- Per-review discussion table. Each row is a user-authored comment tied to a
-- parent review; body check prevents empty/whitespace-only comments.
CREATE TABLE IF NOT EXISTS app.review_comments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	review_id uuid NOT NULL REFERENCES app.reviews(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
	body text NOT NULL CHECK (length(trim(body)) > 0),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotently attach the shared `updated_at` trigger for comment edits.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgname = 'trg_review_comments_updated_at'
	) THEN
		CREATE TRIGGER trg_review_comments_updated_at
		BEFORE UPDATE ON app.review_comments
		FOR EACH ROW
		EXECUTE FUNCTION app.set_updated_at();
	END IF;
END;
$$;

-- Index tuned for loading one review thread in chronological/near-chronological views.
CREATE INDEX IF NOT EXISTS idx_review_comments_review_created_at
	ON app.review_comments(review_id, created_at DESC);

-- Search event log used for analytics and linking crawler results back to the
-- originating query/user context.
CREATE TABLE IF NOT EXISTS app.game_searches (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	game_name citext NOT NULL,
	searched_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
	searched_at timestamptz NOT NULL DEFAULT now(),
	client_ip inet,
	user_agent text
);

-- Composite index for game-level search history and recency queries.
CREATE INDEX IF NOT EXISTS idx_game_searches_game_name_searched_at
	ON app.game_searches(game_name, searched_at DESC);

-- Stores external crawler/video records associated with one search event.
-- `raw_payload` preserves original provider fields for later analysis/debugging.
CREATE TABLE IF NOT EXISTS app.video_search_results (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	search_id uuid NOT NULL REFERENCES app.game_searches(id) ON DELETE CASCADE,
	source text NOT NULL DEFAULT 'serpapi',
	video_link text,
	title text,
	channel text,
	duration text,
	views text,
	published_date text,
	thumbnail text,
	raw_payload jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Direct lookup index for resolving all persisted results of a given search id.
CREATE INDEX IF NOT EXISTS idx_video_search_results_search_id
	ON app.video_search_results(search_id);

-- Comment insert API function. Performs required-field checks and trims body,
-- then inserts one comment row and returns generated comment id.
CREATE OR REPLACE FUNCTION app.add_review_comment(
	p_user_id uuid,
	p_review_id uuid,
	p_body text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
	v_comment_id uuid;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'user_id is required';
	END IF;

	IF p_review_id IS NULL THEN
		RAISE EXCEPTION 'review_id is required';
	END IF;

	IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
		RAISE EXCEPTION 'comment body is required';
	END IF;

	INSERT INTO app.review_comments (review_id, user_id, body)
	VALUES (p_review_id, p_user_id, trim(p_body))
	RETURNING id INTO v_comment_id;

	RETURN v_comment_id;
END;
$$;

-- Read model for one review's comments with masked author display names.
-- Uses bounded limit and ascending order for natural thread reading.
CREATE OR REPLACE FUNCTION app.list_review_comments(p_review_id uuid, p_limit int DEFAULT 100)
RETURNS TABLE (
	comment_id uuid,
	body text,
	created_at timestamptz,
	author text
)
LANGUAGE sql
STABLE
AS $$
	SELECT
		c.id AS comment_id,
		c.body,
		c.created_at,
		(
			CASE
				WHEN position('@' in u.email::text) > 1
				THEN left(split_part(u.email::text, '@', 1), 1) || '***'
				ELSE 'user'
			END
		) AS author
	FROM app.review_comments c
	JOIN app.users u ON u.id = c.user_id
	WHERE c.review_id = p_review_id
	ORDER BY c.created_at ASC
	LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

-- Records a search event with optional user/IP/agent attribution so crawler and
-- gameplay-review features can tie downstream data back to the initiating query.
CREATE OR REPLACE FUNCTION app.log_game_search(
	p_game_name citext,
	p_user_id uuid DEFAULT NULL,
	p_ip inet DEFAULT NULL,
	p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
	v_search_id uuid;
BEGIN
	IF p_game_name IS NULL OR length(trim(p_game_name::text)) = 0 THEN
		RAISE EXCEPTION 'game name is required';
	END IF;

	INSERT INTO app.game_searches (game_name, searched_by_user_id, client_ip, user_agent)
	VALUES (trim(p_game_name::text)::citext, p_user_id, p_ip, p_user_agent)
	RETURNING id INTO v_search_id;

	RETURN v_search_id;
END;
$$;

-- Bulk-ingests provider results from a JSON array payload into normalized rows.
-- Non-array payloads return 0 to keep caller behavior predictable.
CREATE OR REPLACE FUNCTION app.store_video_results(
	p_search_id uuid,
	p_source text,
	p_results jsonb
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
	v_item jsonb;
	v_count int := 0;
BEGIN
	IF p_search_id IS NULL THEN
		RAISE EXCEPTION 'search_id is required';
	END IF;

	IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
		RETURN 0;
	END IF;

	FOR v_item IN SELECT * FROM jsonb_array_elements(p_results)
	LOOP
		INSERT INTO app.video_search_results (
			search_id,
			source,
			video_link,
			title,
			channel,
			duration,
			views,
			published_date,
			thumbnail,
			raw_payload
		)
		VALUES (
			p_search_id,
			COALESCE(NULLIF(trim(p_source), ''), 'serpapi'),
			v_item->>'link',
			v_item->>'title',
			v_item->>'channel',
			v_item->>'duration',
			v_item->>'views',
			v_item->>'published_date',
			v_item->>'thumbnail',
			v_item
		);
		v_count := v_count + 1;
	END LOOP;

	RETURN v_count;
END;
$$;

COMMIT;
