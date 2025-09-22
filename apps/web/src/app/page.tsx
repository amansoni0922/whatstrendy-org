"use client";
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";
const REGIONS = ["GB", "US", "IN"] as const;
type Region = (typeof REGIONS)[number];

type Item = {
  id?: string;
  title?: string;
  url?: string;
  image?: string;
  rank?: number;
  metric?: number;
  artist?: string;
  channel?: string;
  views?: number;
};

function useFetch<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch(`${API_BASE}${path}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!ignore) setData(j as T);
      })
      .catch((e) => !ignore && setError(String(e)))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [path]);
  return { data, loading, error };
}

export default function Home() {
  const [region, setRegion] = useState<Region>("GB");
  const [moviesGlobal, setMoviesGlobal] = useState(false);
  const [musicGlobal, setMusicGlobal] = useState(false);
  const [wikiGlobal] = useState(true); // Wikipedia is global (enwiki)

  const moviesPath = useMemo(
    () => `/pulse/movies?region=${moviesGlobal ? "Global" : region}`,
    [region, moviesGlobal]
  );
  const musicPath = useMemo(
    () => `/pulse/music?region=${musicGlobal ? "Global" : region}`,
    [region, musicGlobal]
  );
  const ytPath = useMemo(() => `/pulse/youtube?region=${region}`, [region]);
  const wikiPath = "/pulse/wiki"; // enwiki global most read

  const movies = useFetch<{ items: Item[] }>(moviesPath);
  const music = useFetch<{ items: Item[] }>(musicPath);
  const yt = useFetch<{ items: Item[] }>(ytPath);
  const wiki = useFetch<{ items: Item[] }>(wikiPath);

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h1 style={{ marginRight: "auto" }}>whatstrendy.org</h1>
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: r === region ? "#111" : "#fff",
              color: r === region ? "#fff" : "#111",
            }}
            aria-pressed={r === region}
          >
            {r}
          </button>
        ))}
      </header>

      <main
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        <Tile
          title={`Movies/TV (Top 10 ${moviesGlobal ? "Global" : region})`}
          toggleLabel="Global"
          toggle={moviesGlobal}
          onToggle={() => setMoviesGlobal((v) => !v)}
          {...movies}
        />
        <Tile
          title={`Music (Top 10 ${musicGlobal ? "Global" : region})`}
          toggleLabel="Global"
          toggle={musicGlobal}
          onToggle={() => setMusicGlobal((v) => !v)}
          {...music}
        />
        <Tile title={`YouTube (Top 20 ${region})`} {...yt} />
        <Tile
          title={`Wikipedia (Top 25 enwiki)`}
          hint="Global = English Wikipedia (enwiki); per-country per-article daily top is not provided by the official endpoint."
          toggleLabel={undefined}
          toggle={wikiGlobal}
          onToggle={undefined}
          {...wiki}
        />
      </main>

      <footer style={{ marginTop: 24, fontSize: 12, color: "#555" }}>
        <p>
          Movie & TV data from TMDB. Music charts from Last.fm. Video charts via
          YouTube Data API. Most-read from Wikipedia Pageviews.
        </p>
      </footer>
    </div>
  );
}

function Tile(props: {
  title: string;
  hint?: string;
  toggleLabel?: string;
  toggle?: boolean;
  onToggle?: () => void;
  data: { items: Item[] } | null;
  loading: boolean;
  error: string | null;
}) {
  const { title, hint, toggleLabel, toggle, onToggle, data, loading, error } =
    props;
  return (
    <section
      style={{
        border: "1px solid #eee",
        borderRadius: 8,
        padding: 12,
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {hint && (
          <span title={hint} aria-label={hint} style={{ cursor: "help" }}>
            ⓘ
          </span>
        )}
        {toggleLabel && onToggle && (
          <label style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <input
              type="checkbox"
              checked={!!toggle}
              onChange={onToggle}
              aria-label={toggleLabel}
            />
            {toggleLabel}
          </label>
        )}
      </header>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "#b00" }}>Error: {error}</p>}
      {!loading && !error && (
        <ol style={{ paddingLeft: 16 }}>
          {(data?.items ?? []).slice(0, 5).map((it, idx) => (
            <li key={it.id ?? idx}>
              <span style={{ opacity: 0.7, marginRight: 6 }}>{it.rank ?? idx + 1}.</span>
              {it.title || it.url || "—"}
              {it.artist ? <em> — {it.artist}</em> : null}
              {typeof it.views === "number" ? (
                <span style={{ marginLeft: 6, opacity: 0.7 }}>{it.views.toLocaleString()} views</span>
              ) : null}
            </li>
          ))}
          {(data?.items ?? []).length === 0 && <li>Waiting for data…</li>}
        </ol>
      )}
    </section>
  );
}
