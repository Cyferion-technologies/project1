# Database Schema Documentation

This document describes every schema object required by the project runtime.

## Extensions

- `pgcrypto`: password hashing (`crypt`, `gen_salt`) and random token bytes.
- `citext`: case-insensitive email and game-name uniqueness.

## Schema Namespace

- `app`: logical namespace for all application tables and functions.

## Core Tables

- `app.users`
- `id uuid` primary key.
- `email citext` unique login identifier.
- `password_hash text` password hash from `crypt(..., gen_salt('bf', 12))`.
- `is_active boolean` soft account status.
- `created_at`, `updated_at`, `last_login_at` audit timestamps.

- `app.sessions`
- `id uuid` primary key.
- `user_id uuid` reference to `app.users(id)`.
- `token_hash bytea` hashed random session token.
- `expires_at`, `revoked_at` lifecycle controls.
- `ip`, `user_agent` diagnostics for login origin.

- `app.games`
- `id uuid` primary key.
- `name citext` unique game title.
- `created_at` creation timestamp.

- `app.reviews`
- `id uuid` primary key.
- `game_id uuid` reference to `app.games(id)`.
- `user_id uuid` reference to `app.users(id)`.
- `rating smallint` constrained to 1..10.
- `title`, `body` review content.
- `created_at`, `updated_at` timestamps.
- `uq_reviews_game_user` ensures one review per user per game.

## Thread and Search Tables

- `app.review_comments`
- `id uuid` primary key.
- `review_id uuid` reference to `app.reviews(id)`.
- `user_id uuid` reference to `app.users(id)`.
- `body text` comment body with non-empty check.
- `created_at`, `updated_at` timestamps.

- `app.game_searches`
- `id uuid` primary key.
- `game_name citext` searched game title.
- `searched_by_user_id uuid` optional user reference.
- `searched_at` timestamp.
- `client_ip`, `user_agent` operational metadata.

- `app.video_search_results`
- `id uuid` primary key.
- `search_id uuid` reference to `app.game_searches(id)`.
- `source text` crawler source (currently `serpapi`).
- normalized metadata fields: `video_link`, `title`, `channel`, `duration`, `views`, `published_date`, `thumbnail`.
- `raw_payload jsonb` full crawler snapshot.
- `created_at` timestamp.

## Triggers

- `trg_users_updated_at`: updates `app.users.updated_at`.
- `trg_reviews_updated_at`: updates `app.reviews.updated_at`.
- `trg_review_comments_updated_at`: updates `app.review_comments.updated_at`.

## SQL Functions

- `app.set_updated_at()`: trigger helper.
- `app.signup(p_email, p_password)`: account creation + password hashing.
- `app.authenticate(p_email, p_password)`: credential validation.
- `app.login(...)`: session token issuance and insert.
- `app.revoke_session(p_session_id)`: revokes session row.
- `app.verify_session(p_session_token)`: checks active session token.
- `app.get_or_create_game(p_name)`: game resolver/upsert.
- `app.upsert_review(...)`: create/update review row.
- `app.list_reviews(p_game_id, p_limit)`: game review list with masked author.
- `app.add_review_comment(...)`: add comment to a review post.
- `app.list_review_comments(p_review_id, p_limit)`: review comment thread list.
- `app.log_game_search(...)`: persists each search event.
- `app.store_video_results(...)`: persists crawler media payload.

## Indexes

- `idx_sessions_user_id`, `idx_sessions_expires_at`, `idx_sessions_revoked_at`.
- `idx_reviews_game_id_created_at`.
- `idx_review_comments_review_created_at`.
- `idx_game_searches_game_name_searched_at`.
- `idx_video_search_results_search_id`.

## Runtime Commands

- Initialize schema: `npm run db:init`.
- Validate connectivity/schema: `npm run db:check`.
- Runtime smoke check: `npm run verify:runtime`.
