import { useState, useEffect, useRef, useCallback } from "react";
import { useFamilyStore } from "../store/useFamilyStore";
import { searchPersons } from "../api/familyTreeApi";
import type { PersonSummary } from "../types/person";

const GENDER_COLOR: Record<string, string> = {
  male:   "bg-blue-500",
  female: "bg-pink-500",
  other:  "bg-purple-500",
};

function PersonPicker({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: PersonSummary | null;
  onSelect: (p: PersonSummary | null) => void;
}) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<PersonSummary[]>([]);
  const containerRef          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    searchPersons(query).then(setResults).catch(() => setResults([]));
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setQuery(""); setResults([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (p: PersonSummary) => {
    onSelect(p); setQuery(""); setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 min-w-48">
        <span className="text-gray-500 text-xs shrink-0">{label}:</span>
        {selected && !query ? (
          <span className="text-white text-sm truncate flex-1">{selected.name}</span>
        ) : (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (selected) setQuery(""); }}
            placeholder={selected ? selected.name : "Search…"}
            className="bg-transparent text-white placeholder-gray-500 outline-none text-sm flex-1 min-w-0 w-36"
          />
        )}
        {selected && (
          <button
            onClick={() => { onSelect(null); setQuery(""); setResults([]); }}
            className="text-gray-500 hover:text-white text-base leading-none shrink-0"
          >
            ×
          </button>
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute top-full mt-1 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700/60 text-left transition-colors"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${GENDER_COLOR[p.gender] ?? "bg-gray-500"}`} />
              <span className="text-white text-sm truncate">{p.name}</span>
              <span className="ml-auto text-gray-500 text-xs shrink-0">{p.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FindConnection() {
  const {
    connectionFrom, connectionTo,
    setConnectionFrom, setConnectionTo,
    connectionResult, connectionLoading,
    findConnection, clearConnection,
    toggleConnectionMode, setCenterId,
  } = useFamilyStore();

  const [expanded, setExpanded] = useState(false);

  // Reset expanded state when a new result arrives
  const prevResultRef = useRef(connectionResult);
  useCallback(() => {
    if (connectionResult !== prevResultRef.current) {
      setExpanded(false);
      prevResultRef.current = connectionResult;
    }
  }, [connectionResult])();

  return (
    <div className="bg-gray-900/95 border-b border-gray-800 px-4 py-3 z-30">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-gray-400 text-xs shrink-0">Find connection between</span>

        <PersonPicker label="Person A" selected={connectionFrom} onSelect={setConnectionFrom} />

        <span className="text-gray-500 text-xs shrink-0">and</span>

        <PersonPicker label="Person B" selected={connectionTo} onSelect={setConnectionTo} />

        <button
          onClick={findConnection}
          disabled={!connectionFrom || !connectionTo || connectionLoading}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-default text-white text-sm rounded-lg transition-colors shrink-0"
        >
          {connectionLoading ? "Finding…" : "Find"}
        </button>

        <button
          onClick={() => { clearConnection(); toggleConnectionMode(); }}
          className="ml-auto text-gray-500 hover:text-white text-xl leading-none shrink-0"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {connectionResult && (
        <div className="mt-3">
          {!connectionResult.found ? (
            <p className="text-gray-400 text-sm">No connection found between these two people.</p>
          ) : (
            <>
              <div className={expanded ? "flex items-start gap-2 flex-wrap" : "overflow-x-auto pb-1"}>
                <div className={expanded ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-2 flex-nowrap w-max"}>
                  {connectionResult.path.map((hop) => (
                    <span key={hop.person.id} className="flex items-center gap-2">
                      <button
                        onClick={() => setCenterId(hop.person.id)}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-white text-sm transition-colors whitespace-nowrap"
                      >
                        {hop.person.name}
                      </button>
                      {hop.relationshipToNext && (
                        <span className="text-gray-400 text-xs shrink-0">
                          — {hop.relationshipToNext} →
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-2 text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                {expanded ? "▲ collapse" : "▼ expand"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
