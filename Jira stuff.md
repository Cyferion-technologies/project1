# Jira Planning Notes

## Product Summary
Video game review website where users can search by game name, read pulled reviews, and authenticated users can post their own reviews.

## Roles
- Admin
- General user (gamer)
- Reviewer (authenticated user)

## Key User Stories
- As an admin, I can moderate reviews and comments.
- As a general user, I can enter a game name and view reviews.
- As a reviewer, I can sign in and publish my own review for a game.

## Epic Breakdown
- EPIC-1: Frontend pages and navigation
- EPIC-2: Backend API and data integration
- EPIC-3: Authentication and authorization
- EPIC-4: Review moderation and quality improvements
- EPIC-5: Deployment, documentation, and testing

## Backlog (Initial)
- Set up backend dependencies and run scripts.
- Serve frontend through backend on same origin (`/api/...` routes).
- Configure Postgres and apply SQL files from `data/`.
- Implement/verify game search endpoint integration.
- Implement/verify review list endpoint by game.
- Implement authenticated review submission flow.
- Implement admin review moderation actions.
- Add input validation and user-friendly API error messages.
- Add README troubleshooting checks (`EADDRINUSE`, missing env vars).
- Add smoke tests for search, read reviews, and submit review.

## Sprint Plan

### Sprint 1: Project setup + core browse flow
- TASK-1: Backend install/run scripts verified from repo root.
- TASK-2: Frontend served by backend at `http://localhost:3001/`.
- TASK-3: DB schema applied from `data/supabase.sql` and `data/supabase-reviews.sql`.
- TASK-4: User can search game and view reviews.

Definition of Done:
- App starts successfully and search + review read path works end-to-end.

### Sprint 2: Auth + write review
- TASK-5: Registration/sign-in flow wired to backend.
- TASK-6: Reviewer can create and submit a review.
- TASK-7: Review persistence confirmed in DB.
- TASK-8: Basic access control on write endpoints.

Definition of Done:
- Authenticated user can post review; unauthenticated user is blocked.

### Sprint 3: Admin moderation + robustness
- TASK-9: Admin moderation actions (remove/approve/edit as implemented).
- TASK-10: Validation for game/review inputs.
- TASK-11: Error handling and frontend feedback states.
- TASK-12: Crawler integration check with `SERPAPI_KEY`.

Definition of Done:
- Admin moderation actions work and invalid inputs are handled cleanly.

### Sprint 4: QA + release prep
- TASK-13: End-to-end smoke tests for critical flows.
- TASK-14: Documentation cleanup in README and setup notes.
- TASK-15: Release candidate bug-fix pass.
- TASK-16: Demo checklist and final presentation prep.

Definition of Done:
- Stable demo build with tested critical flows and updated documentation.

## Labels (recommended)
- `review`
- `sprint`
- `github`
- `task`
- `setup`
- `backend`
- `frontend`
- `database`
- `auth`
- `admin`

## Gap Check From Current Jira Board

### Items to Add or Clarify
- Add a ticket to verify frontend is always served through backend so `/api/...` calls use same origin.
- Add a ticket to apply auth SQL in `data/Auth/` (not only `supabase.sql`) and verify sign-in/register DB tables.
- Add a ticket for review-read API acceptance criteria (search result + reviews list render states).
- Add a ticket for API error handling on frontend (empty state, failed fetch, invalid game query).
- Add a ticket for crawler environment setup (`SERPAPI_KEY`) and behavior when key is missing.
- Add a ticket for admin moderation scope clarity (reviews only vs reviews + comments).
- Add a ticket for role-based endpoint access checks (guest/user/reviewer/admin).
- Add a ticket for smoke testing critical flows before sprint close.

### Process Risks
- Several stories are broad; add acceptance criteria to each story so done-state is testable.
- Add dependency links between auth/database stories and review-posting stories to avoid blocked work.
- Add one release-readiness ticket for runbook checks (`PORT` conflict handling, DB seed, env validation).

### Suggested New Issues
- SCRUM-X1: Verify same-origin frontend/backend integration for `/api/...` routes.
- SCRUM-X2: Apply and validate auth SQL scripts from `data/Auth/`.
- SCRUM-X3: Frontend error and empty-state handling for search/review pages.
- SCRUM-X4: Configure and validate `SERPAPI_KEY` fallback behavior.
- SCRUM-X5: Smoke test: search game, view reviews, sign in, post review, admin moderation.

