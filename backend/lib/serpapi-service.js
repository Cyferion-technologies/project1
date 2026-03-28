const fs = require('fs');
const path = require('path');
const { getJson } = require('serpapi');
const { readEnvValue } = require('./db');

const SERPAPI_DIR = path.join(__dirname, '..', '..', 'serpAPI');
const KEYS_FILE = path.join(SERPAPI_DIR, 'keys.json');

// Defensive existence check for optional config/example files.
// Wrapping fs access avoids hard crashes if paths are missing or inaccessible.
function fileExists(filePath) {
	try {
		return fs.existsSync(filePath);
	} catch {
		return false;
	}
}

// Reads and parses JSON config files, returning null for missing files or
// malformed JSON so upstream logic can continue with other key sources.
function parseJsonFile(filePath) {
	if (!fileExists(filePath)) return null;
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

// Trims and de-quotes potential key values, then applies a minimal length gate
// to filter obvious invalid/placeholder strings before network calls.
function sanitizeKey(value) {
	const key = String(value || '').trim().replace(/^['"]|['"]$/g, '');
	if (key.length < 32) return '';
	return key;
}

// Pulls `api_key: "..."` values from legacy sample scripts. This is a fallback
// path to keep older local setups functional during migration to env/key files.
function extractKeysFromJavaScript(filePath) {
	if (!fileExists(filePath)) return [];
	const content = fs.readFileSync(filePath, 'utf8');
	const keys = [];
	const re = /api_key\s*:\s*["']([^"']+)["']/g;
	let match;
	while ((match = re.exec(content)) !== null) {
		const key = sanitizeKey(match[1]);
		if (key) keys.push(key);
	}
	return keys;
}

function unique(values) {
	return Array.from(new Set(values.filter(Boolean)));
}

// Aggregates candidate API keys from all supported sources and de-duplicates.
// Priority is env vars first, then `serpAPI/keys.json`, then legacy JS samples.
function discoverSerpApiKeys() {
	const discovered = [];

	const envSingle = sanitizeKey(readEnvValue('SERPAPI_KEY'));
	if (envSingle) discovered.push(envSingle);

	const envMany = String(readEnvValue('SERPAPI_KEYS', ''))
		.split(',')
		.map((value) => sanitizeKey(value))
		.filter(Boolean);
	discovered.push(...envMany);

	const keyFileJson = parseJsonFile(KEYS_FILE);
	if (Array.isArray(keyFileJson?.keys)) {
		discovered.push(...keyFileJson.keys.map((value) => sanitizeKey(value)).filter(Boolean));
	}

	const exampleScriptKeys = [
		...extractKeysFromJavaScript(path.join(SERPAPI_DIR, 'youtube-Video-resultsAPI.js')),
		...extractKeysFromJavaScript(path.join(SERPAPI_DIR, 'youtube-videoplayerAPI.js')),
	];
	discovered.push(...exampleScriptKeys);

	return unique(discovered);
}

// Normalizes requested intent into a controlled set of values so query behavior
// is predictable and unknown categories safely fall back to `reviews`.
function normalizeIntent(intent) {
	const value = String(intent || '').trim().toLowerCase();
	if (!value) return 'reviews';
	if (['reviews', 'critic', 'gameplay', 'community', 'comparison'].includes(value)) return value;
	return 'reviews';
}

// Builds an intent-aware search phrase by appending intent-specific terms,
// which nudges YouTube results toward review/discussion content.
function buildSearchQuery(rawQuery, rawIntent) {
	const query = String(rawQuery || '').trim();
	const intent = normalizeIntent(rawIntent);
	if (!query) return { query: '', intent };

	const suffixMap = {
		reviews: 'game review player opinion',
		critic: 'critic review deep analysis',
		gameplay: 'gameplay walkthrough review',
		community: 'community review reactions',
		comparison: 'review comparison graphics performance',
	};

	const suffix = suffixMap[intent] || suffixMap.reviews;
	const full = `${query} ${suffix}`;
	return { query: full, intent };
}

// Maps raw YouTube search result objects into the backend contract consumed by
// frontend + DB persistence layers, while preserving nullable field semantics.
function mapSearchVideo(video) {
	return {
		title: video?.title || null,
		link: video?.link || null,
		video_id: video?.video_id || null,
		channel: video?.channel?.name || video?.channel || null,
		channel_link: video?.channel?.link || null,
		duration: video?.length || video?.duration || null,
		views: video?.views ? String(video.views) : null,
		extracted_views: Number.isFinite(Number(video?.extracted_views)) ? Number(video.extracted_views) : null,
		published_date: video?.published_date || null,
		thumbnail: video?.thumbnail?.static || video?.thumbnail || null,
		description: video?.description || null,
		position: Number.isFinite(Number(video?.position_on_page)) ? Number(video.position_on_page) : null,
	};
}

// Maps optional enriched detail from `youtube_video` calls for a subset of
// results (likes, comment counts, channel metadata, expanded description).
function mapVideoDetail(detail) {
	return {
		likes: detail?.likes || null,
		extracted_likes: Number.isFinite(Number(detail?.extracted_likes)) ? Number(detail.extracted_likes) : null,
		comment_count: detail?.comment_count || null,
		extracted_comment_count: Number.isFinite(Number(detail?.extracted_comment_count))
			? Number(detail.extracted_comment_count)
			: null,
		channel_subscribers: detail?.channel?.subscribers || null,
		channel_verified: Boolean(detail?.channel?.verified),
		description_content: detail?.description?.content || null,
	};
}

// Thin wrapper around SerpAPI client so retry/key-rotation logic can centralize
// request construction and keep call sites concise.
async function fetchWithKey(params, apiKey) {
	return getJson({
		...params,
		api_key: apiKey,
	});
}

// Main crawler pipeline: discover keys, build query, call YouTube search,
// optionally enrich top N results, rotate away invalid keys, and return
// structured success/error payloads for API route handling.
async function fetchYoutubeVideos(rawQuery, rawIntent, limit = 8) {
	const keys = discoverSerpApiKeys();
	if (!keys.length) {
		return {
			error: 'serpapi_not_configured',
			detail: 'No SerpAPI keys were found in env or serpAPI/keys.json.',
		};
	}

	const { query, intent } = buildSearchQuery(rawQuery, rawIntent);
	if (!query) {
		return { error: 'q_required', detail: 'Search query is required.' };
	}

	const invalidKeys = [];
	let lastError = null;

	for (const key of keys) {
		try {
			const search = await fetchWithKey(
				{
					engine: 'youtube',
					search_query: query,
					hl: 'en',
					gl: 'us',
				},
				key
			);

			const baseVideos = Array.isArray(search?.video_results) ? search.video_results.slice(0, Math.max(1, limit)) : [];
			const mapped = baseVideos.map(mapSearchVideo);

			const toEnrich = mapped.slice(0, 4);
			await Promise.all(
				toEnrich.map(async (video) => {
					if (!video.video_id) return;
					try {
						const detail = await fetchWithKey(
							{
								engine: 'youtube_video',
								v: video.video_id,
							},
							key
						);
						video.detail = mapVideoDetail(detail);
					} catch {
						video.detail = null;
					}
				})
			);

			return {
				query,
				intent,
				videos: mapped,
				meta: {
					total_results: mapped.length,
					keys_discovered: keys.length,
					invalid_keys: invalidKeys.length,
					enriched_count: mapped.filter((video) => video.detail).length,
					crawler_source: 'serpAPI-folder',
				},
			};
		} catch (err) {
			const msg = String(err?.message || err || '').toLowerCase();
			if (msg.includes('invalid api key')) {
				invalidKeys.push(key);
				continue;
			}
			lastError = err;
		}
	}

	if (invalidKeys.length === keys.length) {
		return {
			error: 'serpapi_invalid_key',
			detail: 'All discovered SerpAPI keys are invalid.',
		};
	}

	return {
		error: 'serpapi_failed',
		detail: String(lastError?.message || 'SerpAPI request failed'),
	};
}

module.exports = {
	buildSearchQuery,
	discoverSerpApiKeys,
	fetchYoutubeVideos,
	normalizeIntent,
};
