import { useRef, useEffect } from "react";
import { useFamilyStore } from "../store/useFamilyStore";
import SearchResults from "./SearchResults";

export default function SearchBar() {
  const { searchQuery, search, clearSearch, centerId, allPersons } = useFamilyStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const centerName = centerId && allPersons[centerId] ? allPersons[centerId].name : "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSearch();
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSearch]);

  return (
    <div className="relative z-50 flex-1 min-w-0">
      <div className="flex items-center gap-2 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl px-4 py-2 shadow-xl w-full">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          placeholder={centerName ? `Centered on ${centerName}` : "Search family members…"}
          className="bg-transparent text-white placeholder-gray-500 outline-none text-sm flex-1 min-w-0"
        />
        {searchQuery && (
          <button onClick={clearSearch} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        )}
      </div>
      <SearchResults />
    </div>
  );
}
