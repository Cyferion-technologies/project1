# Data Folder

## Canonical SQL Files

- `supabase.sql`: Main schema, auth/session functions, games, reviews.
- `supabase-reviews.sql`: Thread comments, search logs, and crawler result persistence.
- `schema-documentation.md`: Human-readable documentation of all schema objects.

## Apply Order

1. `supabase.sql`
2. `supabase-reviews.sql`

Use the project command from repo root:

```bash
npm run db:init
```

Then verify:

```bash
npm run db:check
```

If using Supabase Cloud, ensure your current client IP is allowed in the project network allow-list.
