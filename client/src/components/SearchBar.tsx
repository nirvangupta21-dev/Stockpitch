import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, X } from "lucide-react";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

interface Props {
  onSelect: (ticker: string) => void;
  currentTicker: string;
}

export default function SearchBar({ onSelect, currentTicker }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: results, isLoading } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", query],
    queryFn: () => apiRequest("GET", `/api/search?q=${encodeURIComponent(query)}`).then(r => r.json()),
    enabled: query.length >= 1,
    staleTime: 10000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(ticker: string) {
    onSelect(ticker);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative" data-testid="search-wrapper">
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          data-testid="input-search"
          type="text"
          placeholder={`Search stocks… (${currentTicker})`}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
          className="w-full pl-9 pr-8 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
        />
        {query && (
          <button
            data-testid="button-clear-search"
            onClick={() => { setQuery(""); setOpen(false); }}
            className="absolute right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && query.length >= 1 && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          )}
          {!isLoading && results && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">No results found</div>
          )}
          {!isLoading && results && results.map(r => (
            <button
              key={r.ticker}
              data-testid={`result-${r.ticker}`}
              onClick={() => handleSelect(r.ticker)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-secondary transition-colors text-left"
            >
              <div>
                <span className="font-semibold text-foreground text-sm font-mono">{r.ticker}</span>
                <span className="ml-2 text-xs text-muted-foreground truncate max-w-[180px]">{r.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{r.exchange}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{r.type}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
