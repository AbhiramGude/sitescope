import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { GeocodingResult } from '../modules/api/client';

interface SearchBoxProps {
  onSelect: (lat: number, lng: number, label: string) => void;
  onSearch: (query: string) => Promise<GeocodingResult[]>;
  placeholder?: string;
}

export const SearchBox: React.FC<SearchBoxProps> = ({ onSelect, onSearch, placeholder = 'Search for a location…' }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 3) { setResults([]); setOpen(false); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await onSearch(val);
        setResults(res.slice(0, 5));
        setOpen(res.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, [onSearch]);

  const handleSelect = (result: GeocodingResult) => {
    setQuery(result.display_name.split(',')[0]);
    setOpen(false);
    setResults([]);
    onSelect(
      parseFloat(result.lat),
      parseFloat(result.lon),
      result.display_name,
    );
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="search-box" style={{ position: 'relative' }}>
      <span className="search-box__icon">
        {loading ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="40" strokeDashoffset="10">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
      </span>
      <input
        className="search-box__input"
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); }
          if (e.key === 'Enter' && results.length > 0) { handleSelect(results[0]); }
        }}
        aria-label="Search location"
        autoComplete="off"
      />
      {query && (
        <button className="search-box__clear" onClick={handleClear} aria-label="Clear search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((r) => {
            const parts = r.display_name.split(', ');
            const name = parts.slice(0, 2).join(', ');
            const address = parts.slice(2).join(', ');
            return (
              <div key={r.place_id} className="search-result-item" onClick={() => handleSelect(r)}>
                <div className="search-result-item__name">{name}</div>
                {address && <div className="search-result-item__address">{address}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
