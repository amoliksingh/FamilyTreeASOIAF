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
            path=[ConnectionHop(person=persons[from_id], relationshipToNext=None)],
        )

    def neighbours(p: Person) -> list[tuple[str, str]]:
        edges: list[tuple[str, str]] = []
        # Siblings first so BFS finds the 1-hop sibling path before the 2-hop parent path
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

    # BFS — track full path as list of (id, label_used_to_arrive)
    visited: set[str] = {from_id}
    queue: deque[list[tuple[str, str | None]]] = deque([[(from_id, None)]])

    while queue:
        path = queue.popleft()
        current_id = path[-1][0]
        person = persons.get(current_id)
        if not person:
            continue
        for next_id, rel in neighbours(person):
            if next_id in visited or next_id not in persons:
                continue
            new_path = path + [(next_id, rel)]
            if next_id == to_id:
                hops = [
                    ConnectionHop(
                        person=persons[pid],
                        relationshipToNext=new_path[i + 1][1] if i + 1 < len(new_path) else None,
                    )
                    for i, (pid, _) in enumerate(new_path)
                ]
                return ConnectionResponse(found=True, path=hops)
            visited.add(next_id)
            queue.append(new_path)

    return ConnectionResponse(found=False, path=[])


# Serve the React build in production — must come after all API routes
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
