const { spawn } = require('child_process');
const path = require('path');

// Simple delay helper used during shutdown to give SIGTERM a short grace period
// before escalating to SIGKILL for stubborn child processes.
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// HTTP helper that returns both status and raw body text so assertions can verify
// route behavior and also print helpful diagnostics on failure.
async function fetchText(url, options) {
	const res = await fetch(url, options);
	const text = await res.text();
	return {
		status: res.status,
		body: text,
	};
}

// Launches backend in a child process using `PORT=0` (ephemeral port) and parses
// startup log output to detect which port the process actually bound to.
async function startServer() {
	return new Promise((resolve, reject) => {
		const cwd = path.join(__dirname, '..');
		const child = spawn(process.execPath, ['index.js'], {
			cwd,
			env: { ...process.env, PORT: '0' },
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		let settled = false;

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill('SIGTERM');
			reject(new Error(`Timed out waiting for backend startup.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
		}, 10000);

		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
			const match = stdout.match(/Backend running on http:\/\/localhost:(\d+)/);
			if (match && !settled) {
				settled = true;
				clearTimeout(timeout);
				resolve({
					child,
					port: Number(match[1]),
					stdout,
					stderr,
				});
			}
		});

		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		child.on('exit', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(new Error(`Backend exited before startup (code ${code}).\nstdout:\n${stdout}\nstderr:\n${stderr}`));
		});
	});
}

// Best-effort shutdown for the spawned backend process: try SIGTERM first,
// wait briefly, then force-kill if the process does not exit.
async function stopServer(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await sleep(500);
	if (!child.killed) {
		child.kill('SIGKILL');
	}
}

// End-to-end runtime probe. Starts backend, exercises core endpoints, outputs
// a machine-readable summary, and exits non-zero when expected checks fail.
async function run() {
	let started;

	try {
		started = await startServer();
		const baseUrl = `http://127.0.0.1:${started.port}`;
		const root = await fetchText(`${baseUrl}/`);
		const health = await fetchText(`${baseUrl}/api/health`);
		const me = await fetchText(`${baseUrl}/api/me`);
		const crawler = await fetchText(`${baseUrl}/api/crawler/youtube?q=Hades`);

		const summary = {
			baseUrl,
			root: {
				status: root.status,
				containsProjectBrand: /project1/i.test(root.body),
			},
			health: {
				status: health.status,
				body: health.body,
			},
			me: {
				status: me.status,
				body: me.body,
			},
			crawler: {
				status: crawler.status,
				body: crawler.body,
			},
		};

		console.log(JSON.stringify(summary, null, 2));

		const failed =
			root.status !== 200 ||
			!/project1/i.test(root.body) ||
			health.status !== 200 ||
			me.status !== 200 ||
			![200, 501, 502].includes(crawler.status);

		if (failed) {
			process.exitCode = 1;
		}
	} catch (err) {
		console.error(err.message);
		process.exitCode = 1;
	} finally {
		await stopServer(started?.child);
	}
}

run();
