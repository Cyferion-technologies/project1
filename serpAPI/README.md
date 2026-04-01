# serpAPI Folder

This folder is the single source for crawler-related assets and API keys.

## Purpose

- Keep SerpAPI key material and crawler references in one place.
- Keep example payload schemas for YouTube search and video detail responses.
- Support key rotation fallback when one key fails.

## Files

- `keys.json` (optional, local secret file, not committed by default):
  - `{ "keys": ["key1", "key2"] }`
- `keys.json.example`:
  - template for creating local `keys.json`.
- `youtube-Video-resultsAPI.js`:
  - sample YouTube search API usage.
- `youtube-videoplayerAPI.js`:
  - sample YouTube video detail API usage.
- `youtubeAPI.json` and `VideoReview.json`:
  - response structure references.

## Runtime Resolution Order

Backend crawler service looks for keys in this order:

1. `SERPAPI_KEY` environment variable
2. `SERPAPI_KEYS` environment variable (comma separated)
3. `serpAPI/keys.json` (`keys` array)
4. keys found in sample scripts in this folder

## Notes

- Keep real keys out of source control.
- Rotate invalid keys by adding multiple keys in `keys.json`.
