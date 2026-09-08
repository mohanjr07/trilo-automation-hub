import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";

type Suggestion = {
  label: string;
  lat: number;
  lon: number;
};

// Free, open-source geocoding API (OSM data) — no API key, no billing.
// https://photon.komoot.io
const PHOTON_URL = "https://photon.komoot.io/api/";

function formatSuggestion(feature: any): string {
  const p = feature.properties ?? {};
  const parts = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean);
  // Dedupe consecutive duplicate parts (e.g. name === city for a city search).
  const seen = new Set<string>();
  const unique = parts.filter((part) => {
    const key = String(part).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(", ");
}

/**
 * Address autocomplete with no API key required — queries Photon
 * (photon.komoot.io), a free open-source geocoder built on OpenStreetMap
 * data. Debounced as the user types; click (or arrow keys + Enter) to pick
 * a suggestion. Degrades to a plain text input if the network request
 * fails — typing still works, it just won't show suggestions.
 */
export default function LocationAutocompleteInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const res = await fetch(`${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=5`);
        if (!res.ok) throw new Error("geocoding request failed");
        const data = await res.json();
        if (thisRequestId !== requestIdRef.current) return; // a newer request superseded this one
        const results: Suggestion[] = (data.features ?? [])
          .map((f: any) => ({
            label: formatSuggestion(f),
            lat: f.geometry?.coordinates?.[1],
            lon: f.geometry?.coordinates?.[0],
          }))
          .filter((s: Suggestion) => s.label);
        setSuggestions(results);
        setOpen(results.length > 0);
        setHighlighted(-1);
      } catch {
        // Silently degrade — plain text input still works.
        setSuggestions([]);
        setOpen(false);
      } finally {
        if (thisRequestId === requestIdRef.current) setLoading(false);
      }
    }, 350);
  };

  const pick = (s: Suggestion) => {
    onChange(s.label);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            fetchSuggestions(e.target.value);
          }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, suggestions.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); pick(suggestions[highlighted]); }
            else if (e.key === "Escape") { setOpen(false); }
          }}
          placeholder={placeholder ?? "Start typing an address..."}
          autoFocus={autoFocus}
          className={className}
          autoComplete="off"
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />
        ) : (
          <MapPin className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-modal">
          {suggestions.map((s, i) => (
            <button
              key={`${s.label}-${i}`}
              type="button"
              onClick={() => pick(s)}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                i === highlighted ? "bg-primary/10 text-primary" : "text-ink-primary hover:bg-muted"
              }`}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
