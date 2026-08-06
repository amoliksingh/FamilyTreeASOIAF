import { useEffect, useRef } from "react";
import { useFamilyStore } from "./store/useFamilyStore";
import SearchBar from "./components/SearchBar";
import FindConnection from "./components/FindConnection";
import RadialTree from "./visualization/RadialTree";

const LEGEND = [
  { role: "center", color: "#f59e0b", label: "Center person" },
  { role: "ancestor", color: "#60a5fa", label: "Ancestor" },
  { role: "descendant", color: "#34d399", label: "Descendant" },
  { role: "spouse", color: "#f472b6", label: "Spouse" },
  { role: "sibling", color: "#a78bfa", label: "Sibling" },
];

export default function App() {
  const { loadAllPersons, isLoading, error, allPersons, centerId, history, goBack, connectionMode, toggleConnectionMode } = useFamilyStore();
  const isPoppingRef = useRef(false);

  useEffect(() => {
    loadAllPersons();
  }, [loadAllPersons]);

  // Push a browser history entry on each navigation so the mobile back button works
  useEffect(() => {
    if (isPoppingRef.current) {
      isPoppingRef.current = false;
      return;
    }
    if (centerId) window.history.pushState({ centerId }, "");
  }, [centerId]);

  // Mobile / browser back button → go back in the tree
  useEffect(() => {
    const onPopstate = () => {
      isPoppingRef.current = true;
      goBack();
    };
    window.addEventListener("popstate", onPopstate);
    return () => window.removeEventListener("popstate", onPopstate);
  }, [goBack]);

  const total = Object.keys(allPersons).length;

  return (
    <div className="w-full h-full flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-gray-900/80 backdrop-blur border-b border-gray-800 z-40">
        <button
          onClick={goBack}
          disabled={history.length === 0}
          className="text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-default text-base px-1 shrink-0"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="text-white font-semibold text-sm tracking-wide shrink-0 hidden sm:block">ASOIAF Family Tree</h1>
        <SearchBar />
        <button
          onClick={toggleConnectionMode}
          title="Find connection between two people"
          className={`shrink-0 p-1.5 rounded-lg transition-colors ${connectionMode ? "text-indigo-400 bg-indigo-900/40" : "text-gray-400 hover:text-white hover:bg-gray-700/50"}`}
          aria-label="Find connection"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>
        <div className="ml-auto text-gray-500 text-xs shrink-0">
          {total > 0 ? `${total} people` : ""}
        </div>
      </div>

      {connectionMode && <FindConnection />}

      {/* Main canvas */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm z-30">
            Loading family data…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-30">
            <div className="bg-red-900/80 text-red-200 px-6 py-4 rounded-xl text-sm">
              {error}
              <br />
              <span className="text-red-400 text-xs">Make sure the backend is running on port 8000.</span>
            </div>
          </div>
        )}
        {!isLoading && !error && !centerId && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm z-30">
            Search for a person to begin.
          </div>
        )}
        <RadialTree />

        {/* Legend — inside canvas so it never overlaps the FindConnection panel */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 z-40">
          {LEGEND.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-gray-400 text-xs">{label}</span>
            </div>
          ))}
          <div className="mt-2 text-gray-600 text-xs">Scroll to zoom · Drag to pan · Click to center</div>
        </div>
      </div>
    </div>
  );
}
