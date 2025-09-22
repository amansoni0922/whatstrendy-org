export const REGIONS = ["GB", "US", "IN"] as const;
export type Region = typeof REGIONS[number];

export const TOPN = {
  movies: 10, // weekly trending
  music: 10, // weekly top tracks
  youtube: 20, // hourly mostPopular
  wiki: 25, // daily most read
} as const;

export const WIKI_PROJECT = "en.wikipedia"; // Global English proxy