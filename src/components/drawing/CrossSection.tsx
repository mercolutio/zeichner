"use client";

import React from "react";
import { FloorplanAnalysis, Floor, Room } from "@/types/floorplan";

interface CrossSectionProps {
  analysis: FloorplanAnalysis;
}

const WALL_T = 5;
const INNER_W = 2.5;
const SLAB_T = 3;
const STROKE = "#2d2d2d";

// Filter rooms by cut line, then lay out by their actual x position
function layoutRooms(
  rooms: Room[],
  buildingWidth: number,
  cutLinePos: number,
  cutLineDir: "horizontal" | "vertical"
) {
  // Filter: only rooms that the cut line passes through
  const filtered = rooms.filter((r) => {
    if (cutLineDir === "horizontal") {
      return r.y <= cutLinePos && r.y + r.length >= cutLinePos;
    }
    return r.x <= cutLinePos && r.x + r.width >= cutLinePos;
  });

  if (filtered.length === 0) {
    // Fallback: show all rooms if none intersect
    const all = [...rooms].sort((a, b) => a.x - b.x);
    const totalW = all.reduce((s, r) => s + r.width, 0);
    const sc = totalW > 0 ? buildingWidth / totalW : 1;
    let cx = 0;
    return all.map((room) => {
      const w = room.width * sc;
      const layout = { room, xStart: cx, width: w };
      cx += w;
      return layout;
    });
  }

  // Sort by x position (left to right for horizontal cut, y for vertical)
  const sorted = [...filtered].sort((a, b) =>
    cutLineDir === "horizontal" ? a.x - b.x : a.y - b.y
  );

  // Use actual x positions, scaled to fit building width
  const minX = Math.min(...sorted.map((r) => (cutLineDir === "horizontal" ? r.x : r.y)));
  const maxX = Math.max(
    ...sorted.map((r) =>
      cutLineDir === "horizontal" ? r.x + r.width : r.y + r.length
    )
  );
  const span = maxX - minX || 1;
  const sc = buildingWidth / span;

  return sorted.map((room) => {
    const pos = cutLineDir === "horizontal" ? room.x : room.y;
    const w = cutLineDir === "horizontal" ? room.width : room.length;
    return {
      room,
      xStart: (pos - minX) * sc,
      width: w * sc,
    };
  });
}

function HatchRect({ x, y, w, h, id }: { x: number; y: number; w: number; h: number; id: string }) {
  const lines: React.ReactElement[] = [];
  const spacing = 4;
  const maxD = w + h;
  for (let d = spacing; d < maxD; d += spacing) {
    lines.push(
      <line key={d} x1={x + Math.min(d, w)} y1={y + Math.max(0, d - w)} x2={x + Math.max(0, d - h)} y2={y + Math.min(d, h)} stroke="#555" strokeWidth={0.5} />
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="white" stroke={STROKE} strokeWidth={0.8} />
      <clipPath id={`clip-${id}`}><rect x={x} y={y} width={w} height={h} /></clipPath>
      <g clipPath={`url(#clip-${id})`}>{lines}</g>
    </g>
  );
}

function WindowEl({ x, y, h }: { x: number; y: number; h: number }) {
  const wH = h * 0.4;
  const wY = y + h * 0.22;
  return (
    <g>
      <rect x={x - 1} y={wY} width={WALL_T + 2} height={wH} fill="white" />
      <line x1={x} y1={wY} x2={x + WALL_T} y2={wY} stroke={STROKE} strokeWidth={1.2} />
      <line x1={x} y1={wY + wH} x2={x + WALL_T} y2={wY + wH} stroke={STROKE} strokeWidth={1.2} />
      <line x1={x + WALL_T / 2} y1={wY + 1} x2={x + WALL_T / 2} y2={wY + wH - 1} stroke="#7cb3d4" strokeWidth={1} />
      <line x1={x - 2} y1={wY + wH} x2={x + WALL_T + 2} y2={wY + wH} stroke={STROKE} strokeWidth={0.8} />
    </g>
  );
}

function StairsEl({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const steps = Math.max(5, Math.round(h / 5));
  const sH = h / steps;
  const sW = w / steps;
  return (
    <g>
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <g key={i}>
          {i < steps && <line x1={x + i * sW} y1={y + h - i * sH} x2={x + (i + 1) * sW} y2={y + h - i * sH} stroke={STROKE} strokeWidth={0.6} />}
          {i > 0 && i <= steps && <line x1={x + i * sW} y1={y + h - i * sH} x2={x + i * sW} y2={y + h - (i - 1) * sH} stroke={STROKE} strokeWidth={0.6} />}
        </g>
      ))}
    </g>
  );
}

// Room background color based on type
function roomColor(room: Room, isKeller: boolean, isDach: boolean): string {
  if (room.category === "keller") return "#f5f0eb";
  if (room.category === "balkon" || room.category === "terrasse") return "#e8f5e9";
  if (room.category === "nutzraum") return "#f0f4ff";
  if (isKeller) return "#f5f0eb";
  if (isDach) return "#fefce8";
  return "#fafafa";
}

export default function CrossSection({ analysis }: CrossSectionProps) {
  const { floors, roofType, roofPitchDegrees, buildingWidth } = analysis;

  const svgW = 800;
  const svgH = 600;
  const margin = { top: 45, right: 70, bottom: 50, left: 70 };

  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);
  const totalFloorH = sortedFloors.reduce((s, f) => s + f.ceilingHeight, 0);
  const roofH = roofType === "Flachdach" ? 0.5 : (buildingWidth / 2) * Math.tan(((roofPitchDegrees || 35) * Math.PI) / 180);
  const foundH = 0.4;
  const totalH = totalFloorH + roofH + foundH;

  const drawW = svgW - margin.left - margin.right;
  const drawH = svgH - margin.top - margin.bottom;
  const scaleX = drawW / buildingWidth;
  const scaleY = drawH / totalH;

  const bL = margin.left;
  const bR = bL + buildingWidth * scaleX;
  const groundY = margin.top + drawH - foundH * scaleY;
  const mToX = (m: number) => bL + m * scaleX;
  const mToH = (m: number) => m * scaleY;

  // Compute floor Y positions
  let curY = groundY;
  const floorPos: { floor: Floor; top: number; bottom: number; h: number; rooms: ReturnType<typeof layoutRooms> }[] = [];
  for (const f of sortedFloors) {
    const h = mToH(f.ceilingHeight);
    curY -= h;
    const rooms = layoutRooms(f.rooms, buildingWidth, analysis.cutLinePosition, analysis.cutLineDirection);
    floorPos.push({ floor: f, top: curY, bottom: curY + h, h, rooms });
  }

  const roofBaseY = floorPos.length > 0 ? floorPos[floorPos.length - 1].top : groundY;
  const roofPeakY = roofBaseY - mToH(roofH);
  const peakX = (bL + bR) / 2;

  // Stair position (centered, between floors)
  const stairXm = buildingWidth * 0.45;
  const stairWm = buildingWidth * 0.1;

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-1">Gebäudeschnitt</h3>
      <p className="text-xs text-gray-500 mb-4">
        {analysis.cutLineDirection === "horizontal" ? "Horizontaler" : "Vertikaler"} Schnitt bei {analysis.cutLinePosition.toFixed(2)} m
      </p>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: "600px" }}>
        <defs>
          <pattern id="ground-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#8B7355" strokeWidth={0.8} />
          </pattern>
        </defs>

        {/* Foundation */}
        <HatchRect x={bL - 3} y={groundY} w={bR - bL + 6} h={mToH(foundH)} id="found" />

        {/* Ground line */}
        <line x1={bL - 25} y1={groundY} x2={bR + 25} y2={groundY} stroke="#8B7355" strokeWidth={2} />
        <rect x={bL - 25} y={groundY} width={bR - bL + 50} height={12} fill="url(#ground-hatch)" opacity={0.5} />

        {/* Floors */}
        {floorPos.map((fp, fi) => {
          const { floor, top, bottom, h, rooms } = fp;
          const isKeller = floor.name.toLowerCase().includes("keller") || floor.level < 0;
          const isDach = floor.name.toLowerCase().includes("dach");
          const isTopFloor = fi === floorPos.length - 1;

          return (
            <g key={fi}>
              {/* Floor slab */}
              <rect x={bL} y={bottom - SLAB_T / 2} width={bR - bL} height={SLAB_T} fill="#888" opacity={0.4} />
              {isTopFloor && <rect x={bL} y={top - SLAB_T / 2} width={bR - bL} height={SLAB_T} fill="#888" opacity={0.3} />}

              {/* Outer walls */}
              <HatchRect x={bL} y={top} w={WALL_T} h={h} id={`lw-${fi}`} />
              <HatchRect x={bR - WALL_T} y={top} w={WALL_T} h={h} id={`rw-${fi}`} />

              {/* Rooms */}
              {rooms.map((rl, ri) => {
                const rx = mToX(rl.xStart) + (ri === 0 ? WALL_T : 0);
                const rw = rl.width * scaleX - (ri === 0 ? WALL_T : 0) - (ri === rooms.length - 1 ? WALL_T : 0);
                const ry = top + SLAB_T / 2;
                const rh = h - SLAB_T;

                return (
                  <g key={ri}>
                    {/* Room fill */}
                    <rect x={rx} y={ry} width={Math.max(rw, 1)} height={rh} fill={roomColor(rl.room, isKeller, isDach)} />

                    {/* Inner wall */}
                    {ri < rooms.length - 1 && (
                      <rect x={rx + rw - INNER_W / 2} y={ry} width={INNER_W} height={rh} fill={STROKE} opacity={0.6} />
                    )}

                    {/* Room name */}
                    {rw > 25 && (
                      <text x={rx + rw / 2} y={ry + rh / 2 - 2} textAnchor="middle" fontSize={rw > 60 ? 11 : rw > 40 ? 9 : 7} fill="#374151" fontFamily="Helvetica, Arial, sans-serif" fontWeight={500}>
                        {rl.room.name}
                      </text>
                    )}
                    {/* Room area */}
                    {rw > 40 && (
                      <text x={rx + rw / 2} y={ry + rh / 2 + 11} textAnchor="middle" fontSize={7} fill="#9ca3af" fontFamily="Helvetica, Arial, sans-serif">
                        {rl.room.area.toFixed(1)} m²
                      </text>
                    )}

                    {/* Windows */}
                    {ri === 0 && !isKeller && <WindowEl x={bL} y={top} h={h} />}
                    {ri === rooms.length - 1 && !isKeller && <WindowEl x={bR - WALL_T} y={top} h={h} />}
                  </g>
                );
              })}

              {/* Stairs between floors */}
              {fi < floorPos.length - 1 && (
                <StairsEl x={mToX(stairXm)} y={top} w={mToH(stairWm) * 2} h={h} />
              )}

              {/* Height dimension */}
              <line x1={bR + 20} y1={top} x2={bR + 20} y2={bottom} stroke="#c00" strokeWidth={0.5} />
              <line x1={bR + 15} y1={top} x2={bR + 25} y2={top} stroke="#c00" strokeWidth={0.5} />
              <line x1={bR + 15} y1={bottom} x2={bR + 25} y2={bottom} stroke="#c00" strokeWidth={0.5} />
              <text x={bR + 30} y={(top + bottom) / 2 + 3} fontSize={8} fill="#c00" fontFamily="Helvetica, Arial, sans-serif">
                {floor.ceilingHeight.toFixed(2)} m
              </text>

              {/* Floor name label */}
              <text x={bL - 8} y={(top + bottom) / 2 + 3} textAnchor="end" fontSize={9} fill="#374151" fontFamily="Helvetica, Arial, sans-serif" fontWeight={600}>
                {floor.name}
              </text>
            </g>
          );
        })}

        {/* Roof */}
        {roofType === "Flachdach" ? (
          <rect x={bL - 8} y={roofBaseY - 6} width={bR - bL + 16} height={6} fill="#d4d4d4" stroke={STROKE} strokeWidth={1} />
        ) : (
          <g>
            <line x1={bL - 12} y1={roofBaseY + 4} x2={peakX} y2={roofPeakY} stroke={STROKE} strokeWidth={1.5} />
            <line x1={peakX} y1={roofPeakY} x2={bR + 12} y2={roofBaseY + 4} stroke={STROKE} strokeWidth={1.5} />
            <line x1={bL + 8} y1={roofBaseY - 2} x2={peakX} y2={roofPeakY + 8} stroke={STROKE} strokeWidth={0.4} strokeDasharray="3,2" />
            <line x1={peakX} y1={roofPeakY + 8} x2={bR - 8} y2={roofBaseY - 2} stroke={STROKE} strokeWidth={0.4} strokeDasharray="3,2" />
            {Array.from({ length: 6 }).map((_, i) => {
              const t = (i + 1) / 7;
              return (
                <g key={i}>
                  <line x1={bL + t * (peakX - bL) - 2} y1={roofBaseY + t * (roofPeakY - roofBaseY) + 2} x2={bL + t * (peakX - bL) + 2} y2={roofBaseY + t * (roofPeakY - roofBaseY) - 2} stroke={STROKE} strokeWidth={2} opacity={0.25} />
                  <line x1={peakX + t * (bR - peakX) - 2} y1={roofPeakY + t * (roofBaseY - roofPeakY) - 2} x2={peakX + t * (bR - peakX) + 2} y2={roofPeakY + t * (roofBaseY - roofPeakY) + 2} stroke={STROKE} strokeWidth={2} opacity={0.25} />
                </g>
              );
            })}
            <rect x={peakX - 3} y={roofPeakY - 2} width={6} height={4} fill={STROKE} rx={1} />
            {roofPitchDegrees && (
              <text x={bL + (peakX - bL) * 0.3} y={roofBaseY - (roofBaseY - roofPeakY) * 0.35} fontSize={9} fill="#555">{roofPitchDegrees}°</text>
            )}
          </g>
        )}

        {/* Total height */}
        <line x1={bL - 35} y1={roofPeakY} x2={bL - 35} y2={groundY} stroke="#c00" strokeWidth={0.5} />
        <line x1={bL - 40} y1={roofPeakY} x2={bL - 30} y2={roofPeakY} stroke="#c00" strokeWidth={0.5} />
        <line x1={bL - 40} y1={groundY} x2={bL - 30} y2={groundY} stroke="#c00" strokeWidth={0.5} />
        <text x={bL - 42} y={(roofPeakY + groundY) / 2 + 3} textAnchor="end" fontSize={8} fill="#c00" fontWeight={600} fontFamily="Helvetica, Arial, sans-serif">
          {(totalFloorH + roofH).toFixed(2)} m
        </text>

        {/* Building width */}
        <line x1={bL} y1={groundY + 28} x2={bR} y2={groundY + 28} stroke="#555" strokeWidth={0.5} />
        <line x1={bL} y1={groundY + 23} x2={bL} y2={groundY + 33} stroke="#555" strokeWidth={0.5} />
        <line x1={bR} y1={groundY + 23} x2={bR} y2={groundY + 33} stroke="#555" strokeWidth={0.5} />
        <text x={(bL + bR) / 2} y={groundY + 42} textAnchor="middle" fontSize={8} fill="#555" fontFamily="Helvetica, Arial, sans-serif">
          {buildingWidth.toFixed(2)} m
        </text>

        <text x={svgW - margin.right} y={svgH - 8} textAnchor="end" fontSize={9} fill="#9ca3af">SCHNITT</text>
      </svg>
    </div>
  );
}
