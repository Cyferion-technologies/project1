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

