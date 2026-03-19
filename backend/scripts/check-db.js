const {
	checkRequiredSchema,
	classifyDatabaseError,
	createPool,
	getDatabaseTarget,
} = require('../lib/db');

async function run() {
	const target = getDatabaseTarget();
	const pool = createPool();

	console.log(`Database target: ${target.provider} via ${target.via}`);
	console.log(`Host: ${target.host}:${target.port}`);
	console.log(`Database: ${target.database || '<unknown>'}`);
	console.log(`SSL: ${target.ssl}`);
	console.log(`Pooler: ${target.pooled ? 'yes' : 'no'}`);

	try {
		await pool.query('SELECT 1');
		console.log('Connection: OK');

		const missing = await checkRequiredSchema(pool);
		if (missing.length > 0) {
			console.error('Schema: INCOMPLETE');
			for (const item of missing) {
				console.error(`- Missing ${item.kind}: ${item.name}`);
			}
			process.exitCode = 1;
			return;
		}

		console.log('Schema: READY');
	} catch (err) {
		const diagnosis = classifyDatabaseError(err);
		if (diagnosis) {
			console.error(`Connection: FAILED (${diagnosis.reason})`);
			console.error(diagnosis.detail);
		} else {
			console.error('Connection: FAILED');
			console.error(err.message);
		}
		process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

run();
