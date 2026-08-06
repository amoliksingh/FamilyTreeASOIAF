import { useFamilyStore } from "../store/useFamilyStore";

const GENDER_COLOR: Record<string, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  other: "bg-purple-500",
};

export default function SearchResults() {
  const { searchResults, setCenterId, searchQuery } = useFamilyStore();

  if (!searchQuery.trim() || searchResults.length === 0) return null;

  return (
    <div className="absolute top-full mt-2 w-full bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
      {searchResults.map((p) => (
        <button
          key={p.id}
          onClick={() => setCenterId(p.id)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700/60 text-left transition-colors"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${GENDER_COLOR[p.gender] ?? "bg-gray-500"}`} />
          <span className="text-white text-sm truncate">{p.name}</span>
          <span className="ml-auto text-gray-500 text-xs shrink-0">{p.id}</span>
        </button>
      ))}
    </div>
  );
}
