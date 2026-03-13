export type MarkerColor = "yellow" | "green" | "blue" | "pink";

export type Marker = {
  id: string;
  start: number;
  end: number;
  color: MarkerColor;
};

export type MarkerDocuments = Record<string, Marker[]>;

export const STORAGE_KEYS = {
  draft: "btmd/draft-source",
  rendered: "btmd/rendered-source",
  theme: "btmd/theme",
  markerDocuments: "btmd/marker-documents"
} as const;

export function hashSource(source: string) {
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `doc_${(hash >>> 0).toString(36)}`;
}

export function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
