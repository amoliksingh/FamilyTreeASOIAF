import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { useFamilyStore } from "../store/useFamilyStore";
import { useRadialLayout, type LayoutNode, type LayoutLink } from "./useRadialLayout";
import { radialLink, shortName } from "./radialUtils"; // shortName used as fallback

const NODE_RADIUS   = 18;
const LABEL_GAP     = 10;   // px between circle edge and label anchor
const TRANSITION_MS = 500;

const ROLE_FILL: Record<string, string> = {
  center:       "#f59e0b",
  ancestor:     "#60a5fa",
  descendant:   "#34d399",
  spouse:       "#f472b6",
  sibling:      "#a78bfa",
  "step-parent": "#94a3b8",  // muted slate — visually distinct from bio ancestors
};

const GENDER_STROKE: Record<string, string> = {
  male:   "#93c5fd",
  female: "#f9a8d4",
  other:  "#c4b5fd",
};

function nodeR(role: string) {
  return role === "center" ? NODE_RADIUS * 1.4 : NODE_RADIUS;
}

// ── Label positioning helpers ─────────────────────────────────────────────────
// Each label is placed in the direction away from the origin (radially outward),
// so it's unambiguously anchored to its own circle regardless of angle.

function labelTransform(d: LayoutNode): string {
  if (d.role === "center") return "";
  const dist = nodeR(d.role) + LABEL_GAP;
  return `translate(${dist * Math.cos(d.angle)},${dist * Math.sin(d.angle)})`;
}

function labelAnchor(d: LayoutNode): string {
  if (d.role === "center") return "middle";
  const c = Math.cos(d.angle);
  // Near-vertical nodes (top/bottom of fan): centre the text horizontally
  if (Math.abs(c) < 0.25) return "middle";
  return c > 0 ? "start" : "end";
}

function labelDy(d: LayoutNode): string | number {
  // Center node: label sits below the circle
  if (d.role === "center") return nodeR(d.role) + 14;
  // All others: vertically centre the text at the anchor point
  return "0.35em";
}

function labelText(d: LayoutNode, allPersons: Record<string, { name: string; firstName: string; lastName: string }>): string {
  const p = allPersons[d.id];
  if (!p) return d.id;
  if (d.role === "center") return p.name;
  return p.firstName || shortName(p.name, 14);
}

export default function RadialTree() {
  const { allPersons, centerId, highlightedId, setCenterId, setHighlightedId } = useFamilyStore();
  const { nodes, links } = useRadialLayout(centerId, allPersons);

  const svgRef       = useRef<SVGSVGElement>(null);
  const zoomLayerRef = useRef<SVGGElement>(null);
  const zoomRef      = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>();

  useEffect(() => {
    if (!svgRef.current || !zoomLayerRef.current) return;
    const svg   = d3.select(svgRef.current);
    const layer = d3.select(zoomLayerRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 6])
      .on("zoom", e => layer.attr("transform", e.transform.toString()));

    svg.call(zoom);
    zoomRef.current = zoom;

    const { width, height } = svgRef.current.getBoundingClientRect();
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));
  }, []);

  useEffect(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const { width, height } = svgRef.current.getBoundingClientRect();
    d3.select(svgRef.current)
      .transition().duration(TRANSITION_MS)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(1));
  }, [centerId]);

  const handleNodeClick = useCallback((id: string) => {
    if (id === centerId) setHighlightedId(highlightedId === id ? null : id);
    else setCenterId(id);
  }, [centerId, highlightedId, setCenterId, setHighlightedId]);

  useEffect(() => {
    if (!zoomLayerRef.current) return;
    const layer = d3.select(zoomLayerRef.current);

    // ── Links ──────────────────────────────────────────────────────────────
    const linkSel = layer.select<SVGGElement>(".links")
      .selectAll<SVGPathElement, LayoutLink>("path")
      .data(links, d => `${d.sourceId}-${d.targetId}`);

    linkSel.enter().append("path")
      .attr("fill", "none")
      .attr("stroke", "#374151").attr("stroke-width", 1.5)
      .attr("stroke-dasharray", d => d.type === "step" ? "5,4" : "0")
      .attr("opacity", 0)
      .attr("d", d => radialLink(d.sourceRadius, d.sourceAngle, d.targetRadius, d.targetAngle))
      .transition().duration(TRANSITION_MS).attr("opacity", 1);

    linkSel.transition().duration(TRANSITION_MS)
      .attr("d", d => radialLink(d.sourceRadius, d.sourceAngle, d.targetRadius, d.targetAngle))
      .attr("stroke-dasharray", d => d.type === "step" ? "5,4" : "0")
      .attr("opacity", 1);

    linkSel.exit().transition().duration(TRANSITION_MS / 2).attr("opacity", 0).remove();

    // ── Circles (painted first so no circle ever covers a label) ───────────
    const ncSel = layer.select<SVGGElement>(".node-circles")
      .selectAll<SVGGElement, LayoutNode>("g.nc")
      .data(nodes, d => d.id);

    const ncEnter = ncSel.enter()
      .append("g").attr("class", "nc")
      .attr("transform", d => `translate(${d.x},${d.y})`).attr("opacity", 0)
      .style("cursor", "pointer")
      .on("click", (_, d) => handleNodeClick(d.id));

    ncEnter.append("circle")
      .attr("r",            d => nodeR(d.role))
      .attr("fill",         d => ROLE_FILL[d.role] ?? "#6b7280")
      .attr("stroke",       d => GENDER_STROKE[allPersons[d.id]?.gender ?? "other"] ?? "#9ca3af")
      .attr("stroke-width", 2);

    ncEnter.transition().duration(TRANSITION_MS)
      .attr("opacity", 1).attr("transform", d => `translate(${d.x},${d.y})`);

    const ncUpdate = ncSel.on("click", (_, d) => handleNodeClick(d.id));
    ncUpdate.transition().duration(TRANSITION_MS)
      .attr("transform", d => `translate(${d.x},${d.y})`).attr("opacity", 1);
    ncUpdate.select("circle").transition().duration(TRANSITION_MS)
      .attr("r", d => nodeR(d.role)).attr("fill", d => ROLE_FILL[d.role] ?? "#6b7280");

    ncSel.exit().transition().duration(TRANSITION_MS / 2).attr("opacity", 0).remove();

    // Highlight ring
    layer.select<SVGGElement>(".node-circles")
      .selectAll<SVGGElement, LayoutNode>("g.nc").select("circle")
      .attr("stroke-width", d => d.id === highlightedId ? 4 : 2)
      .attr("stroke", d => {
        if (d.id === highlightedId) return "#fbbf24";
        return GENDER_STROKE[allPersons[d.id]?.gender ?? "other"] ?? "#9ca3af";
      });

    // ── Labels (painted on top of all circles) ─────────────────────────────
    const nlSel = layer.select<SVGGElement>(".node-labels")
      .selectAll<SVGGElement, LayoutNode>("g.nl")
      .data(nodes, d => d.id);

    const nlEnter = nlSel.enter()
      .append("g").attr("class", "nl")
      .attr("transform", d => `translate(${d.x},${d.y})`).attr("opacity", 0)
      .attr("pointer-events", "none");

    nlEnter.append("text")
      // Dark halo keeps text legible over any background
      .attr("stroke", "#030712").attr("stroke-width", 3)
      .attr("stroke-linejoin", "round").style("paint-order", "stroke")
      .attr("fill",        "#e5e7eb")
      .attr("font-size",   d => d.role === "center" ? "13px" : "10px")
      .attr("font-weight", d => d.role === "center" ? "bold"  : "normal")
      .attr("transform",   labelTransform)
      .attr("text-anchor", labelAnchor)
      .attr("dy",          labelDy)
      .text(d => labelText(d, allPersons));

    nlEnter.transition().duration(TRANSITION_MS)
      .attr("opacity", 1).attr("transform", d => `translate(${d.x},${d.y})`);

    const nlUpdate = nlSel;
    nlUpdate.transition().duration(TRANSITION_MS)
      .attr("transform", d => `translate(${d.x},${d.y})`).attr("opacity", 1);
    nlUpdate.select("text")
      .attr("transform",   labelTransform)
      .attr("text-anchor", labelAnchor)
      .attr("dy",          labelDy)
      .attr("font-size",   d => d.role === "center" ? "13px" : "10px")
      .attr("font-weight", d => d.role === "center" ? "bold"  : "normal")
      .text(d => labelText(d, allPersons));

    nlSel.exit().transition().duration(TRANSITION_MS / 2).attr("opacity", 0).remove();

  }, [nodes, links, allPersons, highlightedId, handleNodeClick]);

  return (
    <svg ref={svgRef} className="w-full h-full bg-gray-950" style={{ display: "block" }}>
      <g ref={zoomLayerRef}>
        <g className="links" />
        <g className="node-circles" />
        <g className="node-labels"  />
      </g>
    </svg>
  );
}
