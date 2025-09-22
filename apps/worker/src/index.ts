/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

type Env = {
	PULSE_KV: KVNamespace;
	REGIONS: string;
	WIKI_PROJECT: string;
	TMDB_API_KEY?: string;
	LASTFM_API_KEY?: string;
	YT_API_KEY?: string;
};

function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	} as Record<string, string>;
}

function json(data: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(data), {
		headers: { "Content-Type": "application/json", ...corsHeaders() },
		...init,
	});
}

function notFound(msg = "Not Found") {
	return json({ error: msg }, { status: 404 });
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders() });
		}

		// Routing
		if (url.pathname === "/pulse/health") {
			const health = await env.PULSE_KV.get("pulse:health", { type: "json" });
			return json(health ?? { status: "ok", note: "No refresh yet" });
		}
		if (url.pathname === "/pulse/version") {
			return json({ build_time: new Date().toISOString() });
		}
		if (url.pathname.startsWith("/pulse/movies")) {
			return json({ items: [], source: "tmdb", note: "stub" });
		}
		if (url.pathname.startsWith("/pulse/music")) {
			return json({ items: [], source: "lastfm", note: "stub" });
		}
		if (url.pathname.startsWith("/pulse/youtube")) {
			return json({ items: [], source: "youtube", note: "stub" });
		}
			if (url.pathname.startsWith("/pulse/wiki")) {
				try {
					const project = env.WIKI_PROJECT || "en.wikipedia";
				const dateParam = url.searchParams.get("date"); // YYYY-MM-DD optional
					const topKeyPrefix = `wiki:enwiki:mostread:top25:`;
					const latestPtrKey = `${topKeyPrefix}latest`;

							let keyDate: string | null = dateParam;
							if (!keyDate) {
								keyDate = (await env.PULSE_KV.get(latestPtrKey)) ?? null;
							}
							if (keyDate) {
						const cached = await env.PULSE_KV.get(`${topKeyPrefix}${keyDate}`, {
							type: "json",
						});
						if (cached) return json(cached);
					}
				// Fallback: fetch yesterday or earlier and cache
				const { ymd, data } = await fetchWikiWithFallback(project);
				await env.PULSE_KV.put(`${topKeyPrefix}${ymd}`, JSON.stringify(data));
				await env.PULSE_KV.put(latestPtrKey, ymd);
				await bumpHealth(env, "wikipedia", ymd);
				return json(data);
				} catch (e) {
					return json({ items: [], source: "wikipedia", error: String(e) }, { status: 502 });
				}
			}

		return notFound();
	},

	// Cron stubs
	async scheduled(event, env, ctx) {
			// Hourly and daily jobs
			if (event.cron === "30 0 * * *") {
				ctx.waitUntil(
					(async () => {
						try {
							const y = yesterdayUTC();
							const data = await fetchWikiTop(env.WIKI_PROJECT || "en.wikipedia", y);
							const topKeyPrefix = `wiki:enwiki:mostread:top25:`;
							await env.PULSE_KV.put(`${topKeyPrefix}${y}`, JSON.stringify(data));
							await env.PULSE_KV.put(`${topKeyPrefix}latest`, y);
							await bumpHealth(env, "wikipedia", y);
						} catch (e) {
							// swallow errors; serve stale
						}
					})()
				);
			}
	},
} satisfies ExportedHandler<Env>;

	function yesterdayUTC(): string {
		const now = new Date();
		// Move to yesterday in UTC by subtracting 1 day of milliseconds
		const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const yyyy = y.getUTCFullYear();
		const mm = String(y.getUTCMonth() + 1).padStart(2, "0");
		const dd = String(y.getUTCDate()).padStart(2, "0");
		return `${yyyy}-${mm}-${dd}`;
	}

	async function fetchWikiTop(project: string, ymd: string) {
		// Wikimedia REST API expects YYYY/MM/DD
		const [y, m, d] = ymd.split("-");
		const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${project}/all-access/${y}/${m}/${d}`;
			const res = await fetch(url, { headers: { "User-Agent": "whatstrendy.org/1.0 (contact: admin@whatstrendy.org)" } });
			if (!res.ok) throw new Error(`wiki ${res.status}`);
		const j = await res.json<any>();
		const articles = j?.items?.[0]?.articles ?? [];
		const items = (articles as any[])
			.filter((a) => a.article && a.article !== "Main_Page" && a.article !== "Special:Search")
			.slice(0, 25)
			.map((a, idx) => ({
				id: a.article,
				title: decodeURIComponent(a.article.replace(/_/g, " ")),
				url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
				rank: a.rank ?? idx + 1,
				views: a.views,
				project,
				snapshot_at: new Date().toISOString(),
				source: "wikipedia",
				region: "Global",
			}));
		return {
			snapshot_at: new Date().toISOString(),
			region: "Global",
			source: "wikipedia",
			items,
		} as const;
	}

	async function fetchWikiWithFallback(project: string, maxBackDays = 7) {
		let attempt = 0;
		let day = new Date();
		while (attempt < maxBackDays) {
			// Go back by 1 day per attempt, starting from yesterday
			day = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
			day = new Date(day.getTime() - 24 * 60 * 60 * 1000);
			const ymd = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
			try {
				const data = await fetchWikiTop(project, ymd);
				return { ymd, data } as const;
			} catch (e: any) {
				const msg = String(e || "");
				if (!msg.includes("wiki 404")) {
					// other errors: break early
					throw e;
				}
				attempt++;
				continue;
			}
		}
		throw new Error("wiki no recent days available");
	}

	async function bumpHealth(env: Env, tile: string, ymd: string) {
		const key = "pulse:health";
		let health: any = await env.PULSE_KV.get(key, { type: "json" });
		if (!health) health = {};
		health[tile] = { last_refresh: new Date().toISOString(), key: ymd };
		await env.PULSE_KV.put(key, JSON.stringify(health));
	}
