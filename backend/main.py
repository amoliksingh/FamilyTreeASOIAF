from __future__ import annotations
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

import data_store
from models import Person, PersonSummary, TreeResponse, ConnectionHop, ConnectionResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    data_store.load()
    yield


app = FastAPI(title="Family Tree API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.middleware("http")
async def force_https(request, call_next):
    # Railway terminates SSL at its proxy and sets X-Forwarded-Proto.
    # Header is absent in local dev (no redirect) and "https" when already secure.
    if request.headers.get("x-forwarded-proto") == "http":
        url = str(request.url).replace("http://", "https://", 1)
        return RedirectResponse(url, status_code=301)
    return await call_next(request)



@app.get("/api/people", response_model=dict[str, Person])
def get_all_people():
    return data_store.get_persons()


@app.get("/api/people/{person_id}", response_model=Person)
def get_person(person_id: str):
    persons = data_store.get_persons()
    if person_id not in persons:
        raise HTTPException(status_code=404, detail=f"Person '{person_id}' not found")
    return persons[person_id]


@app.get("/api/search", response_model=list[PersonSummary])
def search_people(q: str = Query(..., min_length=1)):
    q_lower = q.lower()
    persons = data_store.get_persons()
    results = [
        PersonSummary(id=p.id, name=p.name, gender=p.gender)
        for p in persons.values()
        if q_lower in p.name.lower()
    ]
    return sorted(results, key=lambda x: x.name)[:50]


@app.get("/api/tree/{person_id}", response_model=TreeResponse)
def get_tree(
    person_id: str,
    generations: int = Query(default=4, ge=1, le=8),
):
    persons = data_store.get_persons()
    if person_id not in persons:
        raise HTTPException(status_code=404, detail=f"Person '{person_id}' not found")

    collected: set[str] = {person_id}

    # BFS upward — ancestors
    queue: deque[tuple[str, int]] = deque([(person_id, 0)])
    while queue:
        pid, gen = queue.popleft()
        if gen >= generations:
            continue
        person = persons.get(pid)
        if not person:
            continue
        for parent_id in person.parentIds:
            if parent_id not in collected:
                collected.add(parent_id)
                queue.append((parent_id, gen + 1))

    # BFS downward — descendants
    queue = deque([(person_id, 0)])
    while queue:
        pid, gen = queue.popleft()
        if gen >= generations:
            continue
        person = persons.get(pid)
        if not person:
            continue
        for child_id in person.childIds:
            if child_id not in collected:
                collected.add(child_id)
                queue.append((child_id, gen + 1))

    center = persons[person_id]

    # Siblings: parents' children (excluding center)
    for parent_id in center.parentIds:
        parent = persons.get(parent_id)
        if parent:
            for sib_id in parent.childIds:
                collected.add(sib_id)

    # Spouses of center
    for spouse_id in center.spouseIds:
        collected.add(spouse_id)

    nodes = [persons[pid] for pid in collected if pid in persons]

    return TreeResponse(center=center, nodes=nodes)


@app.get("/api/connection", response_model=ConnectionResponse)
def get_connection(
    from_id: str = Query(..., alias="from"),
    to_id:   str = Query(..., alias="to"),
):
    persons = data_store.get_persons()
    if from_id not in persons:
        raise HTTPException(status_code=404, detail=f"Person '{from_id}' not found")
    if to_id not in persons:
        raise HTTPException(status_code=404, detail=f"Person '{to_id}' not found")

    if from_id == to_id:
        return ConnectionResponse(
            found=True,
            paths=[[ConnectionHop(person=persons[from_id], relationshipToNext=None)]],
        )

    def neighbours_bfs(p: Person) -> list[tuple[str, str]]:
        # Siblings first — BFS finds a direct sibling edge in 1 hop
        edges: list[tuple[str, str]] = []
        seen_sibs: set[str] = set()
        for pid in p.siblingIds:
            edges.append((pid, "sibling of"))
            seen_sibs.add(pid)
        for parent_id in p.parentIds:
            parent = persons.get(parent_id)
            if parent:
                for sib_id in parent.childIds:
                    if sib_id != p.id and sib_id not in seen_sibs:
                        edges.append((sib_id, "sibling of"))
                        seen_sibs.add(sib_id)
        for pid in p.parentIds:     edges.append((pid, "child of"))
        for pid in p.childIds:      edges.append((pid, "parent of"))
        for pid in p.spouseIds:     edges.append((pid, "spouse of"))
        for pid in p.stepParentIds: edges.append((pid, "step-child of"))
        return edges

    def neighbours_dfs(p: Person) -> list[tuple[str, str]]:
        # Direct connections first — DFS fills slots with non-sibling paths first
        edges: list[tuple[str, str]] = []
        for pid in p.parentIds:     edges.append((pid, "child of"))
        for pid in p.childIds:      edges.append((pid, "parent of"))
        for pid in p.spouseIds:     edges.append((pid, "spouse of"))
        for pid in p.stepParentIds: edges.append((pid, "step-child of"))
        seen_sibs: set[str] = set()
        for pid in p.siblingIds:
            edges.append((pid, "sibling of"))
            seen_sibs.add(pid)
        for parent_id in p.parentIds:
            parent = persons.get(parent_id)
            if parent:
                for sib_id in parent.childIds:
                    if sib_id != p.id and sib_id not in seen_sibs:
                        edges.append((sib_id, "sibling of"))
                        seen_sibs.add(sib_id)
        return edges

    def direct_neighbours(p: Person) -> set[str]:
        return {nid for nid, _ in neighbours_bfs(p)}

    def path_to_hops(raw: list[tuple[str, str | None]]) -> list[ConnectionHop]:
        return [
            ConnectionHop(
                person=persons[pid],
                relationshipToNext=raw[i + 1][1] if i + 1 < len(raw) else None,
            )
            for i, (pid, _) in enumerate(raw)
            if pid in persons
        ]

    # Phase 1 — BFS finds the true shortest path (always in results)
    bfs_visited: set[str] = {from_id}
    bfs_queue: deque[list[tuple[str, str | None]]] = deque([[(from_id, None)]])
    shortest_raw: list[tuple[str, str | None]] | None = None

    while bfs_queue and shortest_raw is None:
        path = bfs_queue.popleft()
        person = persons.get(path[-1][0])
        if not person:
            continue
        for next_id, rel in neighbours_bfs(person):
            if next_id in bfs_visited or next_id not in persons:
                continue
            new_path = path + [(next_id, rel)]
            if next_id == to_id:
                shortest_raw = new_path
                break
            bfs_visited.add(next_id)
            bfs_queue.append(new_path)

    if shortest_raw is None:
        return ConnectionResponse(found=False, paths=[])

    # Phase 2 — DFS with in-flight pruning collects alternative paths.
    # Detour rule: skip next_id if it is a direct neighbour of the node
    # immediately before the current one in the path — that makes the current
    # node an unnecessary intermediary (sibling→parent or parent→sibling shortcuts).
    # Raised from 20/5/top-5 so Targaryen-style incest shows up: siblings who
    # married each other give their descendants two equally-valid relations
    # (e.g. first cousins *and* nephew/niece), and each generation that keeps
    # marrying back into the family compounds the number of distinct valid
    # paths between two people. The old caps were tuned for an ordinary tree
    # and silently dropped those extra relationships.
    # 8 was still too tight: distant in-law branches (e.g. Loras Tyrell to a
    # Targaryen only via the Hightower line, through Alicent -> Aegon II ->
    # Jaehaera -> Aegon III) can legitimately run 20+ hops longer than the
    # true shortest path once a marriage is the only bridge between two
    # houses. Benchmarked up to 16 on the densest pairs in this dataset
    # (Loras<->Daenerys, Jaehaerys I<->Alysanne) at well under half a second,
    # so there's headroom before this needs smarter pruning instead.
    MAX_COLLECT    = 60
    MAX_EXTRA_HOPS = 16
    max_len        = len(shortest_raw) + MAX_EXTRA_HOPS
    all_raw: list[list[tuple[str, str | None]]] = [shortest_raw]

    def dfs(
        current_id: str,
        path: list[tuple[str, str | None]],
        visited: set[str],
    ) -> None:
        if len(all_raw) >= MAX_COLLECT or len(path) > max_len:
            return
        if current_id == to_id:
            raw = list(path)
            if raw != shortest_raw:
                all_raw.append(raw)
            return
        person = persons.get(current_id)
        if not person:
            return
        prev_id   = path[-2][0] if len(path) >= 2 else None
        prev_nbrs = direct_neighbours(persons[prev_id]) if prev_id and prev_id in persons else set()
        for next_id, rel in neighbours_dfs(person):
            if next_id in visited or next_id not in persons:
                continue
            if next_id in prev_nbrs:
                continue  # current node is an unnecessary detour between prev and next
            visited.add(next_id)
            path.append((next_id, rel))
            dfs(next_id, path, visited)
            path.pop()
            visited.remove(next_id)

    dfs(from_id, [(from_id, None)], {from_id})
    all_raw.sort(key=len)

    # Ties are common at the max length (e.g. dozens of equally-long paths
    # through a single distant in-law bridge like a Hightower marriage), so
    # a path can be genuinely valid yet still miss a too-tight cutoff by
    # sheer luck of DFS traversal order. 20 gives real long-bridge paths
    # room to land without the list becoming unusable.
    return ConnectionResponse(
        found=True,
        paths=[path_to_hops(p) for p in all_raw[:20]],
    )


# Serve the React build in production — must come after all API routes
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
