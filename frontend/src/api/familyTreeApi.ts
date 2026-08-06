import type { Person, PersonMap, PersonSummary, ConnectionResponse } from "../types/person";

const BASE = "/api";

export async function fetchAllPersons(): Promise<PersonMap> {
  const res = await fetch(`${BASE}/people`);
  if (!res.ok) throw new Error("Failed to load people");
  return res.json();
}

export async function fetchPerson(id: string): Promise<Person> {
  const res = await fetch(`${BASE}/people/${id}`);
  if (!res.ok) throw new Error(`Person ${id} not found`);
  return res.json();
}

export async function searchPersons(q: string): Promise<PersonSummary[]> {
  if (!q.trim()) return [];
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function fetchConnection(fromId: string, toId: string): Promise<ConnectionResponse> {
  const res = await fetch(`${BASE}/connection?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`);
  if (!res.ok) throw new Error("Connection lookup failed");
  return res.json();
}
