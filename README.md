# project1

Software Idea: A video game review website where entering a game name will pull up reviews of that game as well as allow user's themselves to write a review for that specific game.

## Run (backend wired to frontend)

The frontend pages in `front page/` call the API using `/api/...` paths. That means you should open the site through the backend server (same origin), not by double-clicking the HTML file or using Live Server.

1. Install backend deps:

```bash
cd backend
npm install
```

Or from repo root:

```bash
npm run backend:install
```

1. Start the backend (it also serves the frontend):

```bash
# from repo root
npm start
```

1. Open:

<http://localhost:3001/>

1. Initialize database schema and helper tables:

```bash
# from repo root
npm run db:init
```

Notes:

- Most endpoints require Postgres + the SQL in `data/supabase.sql` and `data/supabase-reviews.sql` to be applied.
- Supabase Cloud may reject connections unless your current IP is added to the project's network allow-list.
- If using Supabase, set `PGSSLMODE=require` (or use a `DATABASE_URL` that already enforces SSL).
- YouTube crawler requires `SERPAPI_KEY` in `backend/.env` (without quotes).
- If the key is invalid, the API now responds with `serpapi_invalid_key` and the server keeps running.
- If you get `EADDRINUSE`, start on a different port (example in PowerShell: `$env:PORT=3002; npm start`).

## User Roles

Admin, general users (gamers), video game reviewers

## User Stories

Admin: As an admin, I can moderate the reviews (add/remove, comments/reviews), add and remove features.

General users: As a user, I want to enter the name of a game and then see reviews on that game.

Reviewers: As a reviewer, I want to sign in and publish my own review on a specific game.

## Process

Identify Core Features: AI crawlers that lets us gather product review for our users through API key. We have a humble landing site for login and efficient sign up options.

Build the MVP: Simple feature set that makes up the project.

Launch and Gather Feedback: Gather feedback.

Iterate: Refine and improve the product, adding features or making adjustments as necessary.
