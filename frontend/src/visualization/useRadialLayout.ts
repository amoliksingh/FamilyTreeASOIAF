import { useMemo } from "react";
import type { PersonMap } from "../types/person";
import { polarToXY } from "./radialUtils";

export type NodeRole = "center" | "ancestor" | "descendant" | "spouse" | "sibling" | "step-parent";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  angle: number;
  ring: number;
  role: NodeRole;
}

export interface LayoutLink {
  sourceId: string;
  targetId: string;
  sourceRadius: number;
  sourceAngle: number;
  targetRadius: number;
  targetAngle: number;
  type?: "step";
}

interface LayoutResult {
  nodes: LayoutNode[];
  links: LayoutLink[];
}

// Fixed structural limits
const MAX_GEN      = 4;
const RING_BASE    = 160;   // minimum radius for gen-1 ring
const BASE_STEP    = 110;   // minimum radial step between consecutive rings
const MIN_RING_GAP = 80;    // hard floor on any two adjacent rings
const MIN_ARC      = 48;    // px of arc needed per node (36px node + 12px gap)
const OUTER_R_EST  = 550;   // estimate for spread calc (avoids circular dependency)
const UP           = -Math.PI / 2;
const DOWN         =  Math.PI / 2;
const SPOUSE_R     = 85;
const MAX_SIB_ZONE = 5;

export function useRadialLayout(
  centerId: string | null,
  persons: PersonMap
): LayoutResult {
  return useMemo(() => {
    if (!centerId || !persons[centerId]) return { nodes: [], links: [] };

    // ── Leaf-count helpers (for proportional sector weights and fan spread) ──

    function descLeaves(id: string, depth: number): number {
      if (depth >= MAX_GEN || !persons[id]) return 1;
      const ch = persons[id].childIds;
      if (ch.length === 0) return 1;
      return ch.reduce((s, cid) => s + descLeaves(cid, depth + 1), 0);
    }

    function ancLeaves(id: string, depth: number): number {
      if (depth >= MAX_GEN || !persons[id]) return 1;
      const ps = persons[id].parentIds.slice(0, 2);
      if (ps.length === 0) return 1;
      return ps.reduce((s, pid) => s + ancLeaves(pid, depth + 1), 0);
    }

    // ── Dynamic fan spread ──
    // Sized so OUTER_R_EST has at least MIN_ARC per leaf. Clamped 36°–83°.
    function computeSpread(leafCount: number): number {
      const needed = (leafCount * MIN_ARC) / (2 * OUTER_R_EST);
      return Math.min(Math.PI * 0.46, Math.max(Math.PI * 0.20, needed));
    }

    const centerPerson  = persons[centerId];
    const descLeafTotal = centerPerson.childIds.reduce((s, c) => s + descLeaves(c, 1), 0);
    const ancLeafTotal  = centerPerson.parentIds.slice(0, 2).reduce((s, p) => s + ancLeaves(p, 1), 0);
    const descSpread    = computeSpread(descLeafTotal);
    const ancSpread     = computeSpread(ancLeafTotal);

    // ── Pre-count nodes at each generation (separate BFS per direction) ──
    // These counts drive the dynamic ring-gap calculation.

    function preCount(
      startId: string,
      getNeighbours: (id: string) => string[]
    ): number[] {
      const counts = new Array<number>(MAX_GEN + 1).fill(0);
      const q: Array<{ id: string; gen: number }> = [{ id: startId, gen: 0 }];
      const seen = new Set<string>([startId]);
      while (q.length) {
        const { id, gen } = q.shift()!;
        if (gen >= MAX_GEN) continue;
        for (const nid of getNeighbours(id)) {
          if (!seen.has(nid)) {
            seen.add(nid);
            counts[gen + 1]++;
            q.push({ id: nid, gen: gen + 1 });
          }
        }
      }
      return counts;
    }

    const descCounts = preCount(centerId, id => persons[id]?.childIds ?? []);
    const ancCounts  = preCount(centerId, id => persons[id]?.parentIds.slice(0, 2) ?? []);

    // ── Dynamic ring radii ──
    // Each ring's radius is the maximum of:
    //   (a) the base progression (RING_BASE + g*BASE_STEP) — keeps small trees compact
    //   (b) what's needed to give every node at this generation MIN_ARC of arc
    //   (c) previous ring + MIN_RING_GAP — prevents rings from collapsing together

    function computeRingRadii(counts: number[], spread: number): number[] {
      const radii = [0]; // gen 0 = centre node
      for (let g = 1; g <= MAX_GEN; g++) {
        const n        = counts[g];
        const byCount  = n > 0 && spread > 0 ? (n * MIN_ARC) / (2 * spread) : 0;
        const byStep   = radii[g - 1] + MIN_RING_GAP;
        const base     = RING_BASE + (g - 1) * BASE_STEP;
        radii.push(Math.max(base, byCount, byStep));
      }
      return radii;
    }

    const descRadii = computeRingRadii(descCounts, descSpread);
    const ancRadii  = computeRingRadii(ancCounts,  ancSpread);

    // Sibling rings float just outside the gen-1 ring
    const sibR1 = Math.max(descRadii[1], ancRadii[1]);
    const sibR2 = sibR1 + 70;

    // Sibling zone = horizontal gap remaining after both fans
    const siblingGap = Math.max(0.08, Math.PI / 2 - Math.max(descSpread, ancSpread));

    const nodes: LayoutNode[] = [];
    const links: LayoutLink[] = [];
    const placed = new Map<string, LayoutNode>();

    function place(id: string, role: NodeRole, radius: number, angle: number, ring: number): LayoutNode {
      const [x, y] = polarToXY(angle, radius);
      const node: LayoutNode = { id, x, y, radius, angle, ring, role };
      nodes.push(node);
      placed.set(id, node);
      return node;
    }

    // ── Center ──
    place(centerId, "center", 0, 0, 0);

    // ── Ancestors (BFS upward, proportional sector weights, dynamic ring radii) ──
    interface Job { id: string; gen: number; angleMin: number; angleMax: number; }

    const ancQueue: Job[] = [{ id: centerId, gen: 0, angleMin: UP - ancSpread, angleMax: UP + ancSpread }];
    const ancSeen = new Set<string>([centerId]);

    while (ancQueue.length > 0) {
      const { id, gen, angleMin, angleMax } = ancQueue.shift()!;
      if (gen >= MAX_GEN) continue;
      const person = persons[id];
      if (!person || person.parentIds.length === 0) continue;

      const parents   = person.parentIds.slice(0, 2);
      const weights   = parents.map(pid => ancLeaves(pid, gen + 1));
      const totalW    = weights.reduce((s, w) => s + w, 0);
      const totalArc  = angleMax - angleMin;
      const r         = ancRadii[gen + 1];
      let cumW = 0;

      parents.forEach((pid, i) => {
        if (ancSeen.has(pid)) { cumW += weights[i]; return; }
        ancSeen.add(pid);
        const sMin  = angleMin + (cumW / totalW) * totalArc;
        cumW += weights[i];
        const sMax  = angleMin + (cumW / totalW) * totalArc;
        const angle = (sMin + sMax) / 2;
        place(pid, "ancestor", r, angle, -(gen + 1));
        const child = placed.get(id)!;
        links.push({ sourceId: pid, targetId: id, sourceRadius: r, sourceAngle: angle, targetRadius: child.radius, targetAngle: child.angle });
        ancQueue.push({ id: pid, gen: gen + 1, angleMin: sMin, angleMax: sMax });
      });
    }

    // ── Descendants (BFS downward, proportional sector weights, dynamic ring radii) ──
    const descQueue: Job[] = [{ id: centerId, gen: 0, angleMin: DOWN - descSpread, angleMax: DOWN + descSpread }];
    const descSeen = new Set<string>([centerId]);

    while (descQueue.length > 0) {
      const { id, gen, angleMin, angleMax } = descQueue.shift()!;
      if (gen >= MAX_GEN) continue;
      const person = persons[id];
      if (!person || person.childIds.length === 0) continue;

      const children  = person.childIds;
      const weights   = children.map(cid => descLeaves(cid, gen + 1));
      const totalW    = weights.reduce((s, w) => s + w, 0);
      const totalArc  = angleMax - angleMin;
      const r         = descRadii[gen + 1];
      let cumW = 0;

      children.forEach((cid, i) => {
        if (descSeen.has(cid)) { cumW += weights[i]; return; }
        descSeen.add(cid);
        const sMin  = angleMin + (cumW / totalW) * totalArc;
        cumW += weights[i];
        const sMax  = angleMin + (cumW / totalW) * totalArc;
        const angle = (sMin + sMax) / 2;
        place(cid, "descendant", r, angle, gen + 1);
        const parent = placed.get(id)!;
        links.push({ sourceId: id, targetId: cid, sourceRadius: parent.radius, sourceAngle: parent.angle, targetRadius: r, targetAngle: angle });
        descQueue.push({ id: cid, gen: gen + 1, angleMin: sMin, angleMax: sMax });
      });
    }

    // ── Step-parents of center (placed at gen-1 ancestor ring, beside bio parents) ──
    const stepR = ancRadii[1];
    const bioParentAngles = centerPerson.parentIds
      .map(pid => placed.get(pid)?.angle)
      .filter((a): a is number => a !== undefined);
    const ancFanCenter = UP;
    const ancFanEdge   = UP + ancSpread;

    centerPerson.stepParentIds.forEach((spid, i) => {
      if (placed.has(spid)) return;
      // Spread step-parents just beyond the edge of the ancestor fan
      const sign  = i % 2 === 0 ? 1 : -1;
      const offset = (Math.floor(i / 2) + 1) * 0.18;
      const angle = bioParentAngles.length > 0
        ? ancFanEdge * sign + sign * offset
        : ancFanCenter + sign * (ancSpread + offset);
      place(spid, "step-parent", stepR, angle, -1);
      links.push({
        sourceId: spid, targetId: centerId,
        sourceRadius: stepR, sourceAngle: angle,
        targetRadius: 0,    targetAngle: 0,
        type: "step",
      });
    });

    // ── Spouses ──
    centerPerson.spouseIds.forEach((sid, i) => {
      if (placed.has(sid)) return;
      const baseAngle = i % 2 === 0 ? 0 : Math.PI;
      const stack     = Math.floor(i / 2);
      const angle     = baseAngle + stack * 0.12 * (i % 2 === 0 ? 1 : -1);
      const r         = SPOUSE_R + stack * 25;
      place(sid, "spouse", r, angle, 0);
      links.push({ sourceId: centerId, targetId: sid, sourceRadius: 0, sourceAngle: 0, targetRadius: r, targetAngle: angle });
    });

    // ── Siblings ──
    const siblings = [...new Set([
      ...centerPerson.parentIds
        .flatMap(pid => persons[pid]?.childIds ?? [])
        .filter(sid => sid !== centerId && !placed.has(sid)),
      ...(centerPerson.siblingIds ?? [])
        .filter(sid => !placed.has(sid)),
    ])];

    function zoneAngles(base: number, n: number): number[] {
      if (n === 0) return [];
      if (n === 1) return [base];
      const usable = siblingGap * 1.80;
      return Array.from({ length: n }, (_, i) => base + (i / (n - 1) - 0.5) * usable);
    }

    const total = Math.min(siblings.length, MAX_SIB_ZONE * 4);
    const r1Tot = Math.min(MAX_SIB_ZONE * 2, total);
    const r2Tot = total - r1Tot;
    const rR1   = Math.min(MAX_SIB_ZONE, Math.ceil(r1Tot / 2));
    const lR1   = r1Tot - rR1;
    const rR2   = Math.min(MAX_SIB_ZONE, Math.ceil(r2Tot / 2));
    const lR2   = r2Tot - rR2;

    const sibSlots: Array<[number, number]> = [
      ...zoneAngles(0,       rR1).map(a => [a, sibR1] as [number, number]),
      ...zoneAngles(Math.PI, lR1).map(a => [a, sibR1] as [number, number]),
      ...zoneAngles(0,       rR2).map(a => [a, sibR2] as [number, number]),
      ...zoneAngles(Math.PI, lR2).map(a => [a, sibR2] as [number, number]),
    ];

    siblings.slice(0, total).forEach((sid, i) => {
      if (placed.has(sid) || i >= sibSlots.length) return;
      const [angle, r] = sibSlots[i];
      place(sid, "sibling", r, angle, 0);
    });

    return { nodes, links };
  }, [centerId, persons]);
}
