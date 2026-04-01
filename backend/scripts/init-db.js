const fs = require('fs');
const path = require('path');
const {
	checkRequiredSchema,
	classifyDatabaseError,
	createPool,
} = require('../lib/db');

// DB bootstrap entrypoint. Applies schema SQL files in deterministic order,
// then verifies required objects exist so partial/failed init is detected early.
async function run() {
	const pool = createPool();
	const sqlFiles = [
		path.join(__dirname, '..', '..', 'data', 'supabase.sql'),
		path.join(__dirname, '..', '..', 'data', 'supabase-reviews.sql'),
	];

	try {
		for (const file of sqlFiles) {
			const sql = fs.readFileSync(file, 'utf8');
			await pool.query(sql);
			console.log('Applied:', path.basename(file));
		}

		const missing = await checkRequiredSchema(pool);
		if (missing.length > 0) {
			console.error('Database initialization finished, but required objects are still missing:');
			for (const item of missing) {
				console.error(`- Missing ${item.kind}: ${item.name}`);
			}
			process.exitCode = 1;
			return;
		}

		console.log('Database initialization completed.');
	} catch (err) {
		const diagnosis = classifyDatabaseError(err);
		console.error('Database initialization failed:', diagnosis ? diagnosis.detail : err.message);
		process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

run();
