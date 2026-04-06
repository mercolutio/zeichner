"use client";

import React from "react";
import { FloorplanAnalysis, Floor, Room } from "@/types/floorplan";

interface CrossSectionProps {
  analysis: FloorplanAnalysis;
}

type ViewDirection = "front" | "back" | "left" | "right";

const WALL_T = 5;
const INNER_W = 2.5;
const SLAB_T = 3;
const STROKE = "#2d2d2d";

const VIEW_LABELS: Record<ViewDirection, string> = {
  front: "Vorderansicht (Süd)",
  back: "Rückansicht (Nord)",
  left: "Seitenansicht Links (West)",
  right: "Seitenansicht Rechts (Ost)",
};

const SECTION_LABELS: Record<ViewDirection, string> = {
  front: "SCHNITT A-A",
  back: "SCHNITT B-B",
  left: "SCHNITT C-C",
  right: "SCHNITT D-D",
};

// Get rooms for a given view direction, laid out along the cut axis
function getRoomsForView(
  rooms: Room[],
  buildingWidth: number,
  buildingDepth: number,
  direction: ViewDirection
) {
  // For front/back: cut horizontal through depth, show rooms along width
  // For left/right: cut vertical through width, show rooms along depth
  const isHorizontalCut = direction === "front" || direction === "back";
  const cutPos = isHorizontalCut ? buildingDepth / 2 : buildingWidth / 2;

  // Filter rooms intersecting the cut line
  let filtered = rooms.filter((r) => {
    if (isHorizontalCut) {
      return r.y <= cutPos && r.y + r.length >= cutPos;
    }
    return r.x <= cutPos && r.x + r.width >= cutPos;
  });

  // Fallback: show all rooms if none intersect
  if (filtered.length === 0) {
    filtered = [...rooms];
  }

  // Sort by position along the viewing axis
  const sorted = [...filtered].sort((a, b) => {
    if (isHorizontalCut) return a.x - b.x;
    return a.y - b.y;
  });

  // Mirror for back/right views
  const shouldMirror = direction === "back" || direction === "right";

  const spanWidth = isHorizontalCut ? buildingWidth : buildingDepth;

  // Calculate scaled positions
  const minPos = Math.min(
    ...sorted.map((r) => (isHorizontalCut ? r.x : r.y))
  );
  const maxPos = Math.max(
    ...sorted.map((r) =>
      isHorizontalCut ? r.x + r.width : r.y + r.length
    )
  );
  const span = maxPos - minPos || 1;
  const sc = spanWidth / span;

  const layouts = sorted.map((room) => {
    const pos = isHorizontalCut ? room.x : room.y;
    const w = isHorizontalCut ? room.width : room.length;
    let xStart = (pos - minPos) * sc;
    const width = w * sc;

    if (shouldMirror) {
      xStart = spanWidth - xStart - width;
    }

    return { room, xStart, width };
  });

  // Re-sort after mirroring
  if (shouldMirror) {
    layouts.sort((a, b) => a.xStart - b.xStart);
  }

  return layouts;
}

function HatchRect({
  x,
  y,
  w,
  h,
  id,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
}) {
  const lines: React.ReactElement[] = [];
  const spacing = 4;
  const maxD = w + h;
  for (let d = spacing; d < maxD; d += spacing) {
    lines.push(
      <line
        key={d}
        x1={x + Math.min(d, w)}
        y1={y + Math.max(0, d - w)}
        x2={x + Math.max(0, d - h)}
        y2={y + Math.min(d, h)}
        stroke="#555"
        strokeWidth={0.5}
      />
    );
  }
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="white"
        stroke={STROKE}
        strokeWidth={0.8}
      />
      <clipPath id={`clip-${id}`}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
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
      <line
        x1={x}
        y1={wY}
        x2={x + WALL_T}
        y2={wY}
        stroke={STROKE}
        strokeWidth={1.2}
      />
      <line
        x1={x}
        y1={wY + wH}
        x2={x + WALL_T}
        y2={wY + wH}
        stroke={STROKE}
        strokeWidth={1.2}
      />
      <line
        x1={x + WALL_T / 2}
        y1={wY + 1}
        x2={x + WALL_T / 2}
        y2={wY + wH - 1}
        stroke="#7cb3d4"
        strokeWidth={1}
      />
      <line
        x1={x - 2}
        y1={wY + wH}
        x2={x + WALL_T + 2}
        y2={wY + wH}
        stroke={STROKE}
        strokeWidth={0.8}
      />
    </g>
  );
}

function StairsEl({
  x,
  y,
  w,
  h,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const steps = Math.max(5, Math.round(h / 5));
  const sH = h / steps;
  const sW = w / steps;
  return (
    <g>
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <g key={i}>
          {i < steps && (
            <line
              x1={x + i * sW}
              y1={y + h - i * sH}
              x2={x + (i + 1) * sW}
              y2={y + h - i * sH}
              stroke={STROKE}
              strokeWidth={0.6}
            />
          )}
          {i > 0 && i <= steps && (
            <line
              x1={x + i * sW}
              y1={y + h - i * sH}
              x2={x + i * sW}
              y2={y + h - (i - 1) * sH}
              stroke={STROKE}
              strokeWidth={0.6}
            />
          )}
        </g>
      ))}
    </g>
  );
}

function roomColor(room: Room, isKeller: boolean, isDach: boolean): string {
  if (room.category === "keller") return "#f5f0eb";
  if (room.category === "balkon" || room.category === "terrasse")
    return "#e8f5e9";
  if (room.category === "nutzraum") return "#f0f4ff";
  if (isKeller) return "#f5f0eb";
  if (isDach) return "#fefce8";
  return "#fafafa";
}

function SectionView({
  analysis,
  direction,
  compact,
}: {
  analysis: FloorplanAnalysis;
  direction: ViewDirection;
  compact?: boolean;
}) {
  const { floors, roofType, roofPitchDegrees, buildingWidth, buildingDepth } =
    analysis;

  const isHorizontalCut = direction === "front" || direction === "back";
  const spanWidth = isHorizontalCut ? buildingWidth : buildingDepth;

  const svgW = compact ? 500 : 800;
  const svgH = compact ? 380 : 600;
  const margin = compact
    ? { top: 30, right: 50, bottom: 35, left: 50 }
    : { top: 45, right: 70, bottom: 50, left: 70 };

  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);
  const totalFloorH = sortedFloors.reduce((s, f) => s + f.ceilingHeight, 0);
  const roofH =
    roofType === "Flachdach"
      ? 0.5
      : (spanWidth / 2) *
        Math.tan(((roofPitchDegrees || 35) * Math.PI) / 180);
  const foundH = 0.4;
  const totalH = totalFloorH + roofH + foundH;

  const drawW = svgW - margin.left - margin.right;
  const drawH = svgH - margin.top - margin.bottom;
  const scaleX = drawW / spanWidth;
  const scaleY = drawH / totalH;

  const bL = margin.left;
  const bR = bL + spanWidth * scaleX;
  const groundY = margin.top + drawH - foundH * scaleY;
  const mToX = (m: number) => bL + m * scaleX;
  const mToH = (m: number) => m * scaleY;

  let curY = groundY;
  const floorPos: {
    floor: Floor;
    top: number;
    bottom: number;
    h: number;
    rooms: ReturnType<typeof getRoomsForView>;
  }[] = [];

  for (const f of sortedFloors) {
    const h = mToH(f.ceilingHeight);
    curY -= h;
    const rooms = getRoomsForView(f.rooms, buildingWidth, buildingDepth, direction);
    floorPos.push({ floor: f, top: curY, bottom: curY + h, h, rooms });
  }

  const roofBaseY =
    floorPos.length > 0 ? floorPos[floorPos.length - 1].top : groundY;
  const roofPeakY = roofBaseY - mToH(roofH);
  const peakX = (bL + bR) / 2;

  const stairXm = spanWidth * 0.45;
  const stairWm = spanWidth * 0.1;
  const fontSize = compact ? 0.85 : 1;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full"
      style={{ maxHeight: compact ? "380px" : "600px" }}
    >
      <defs>
        <pattern
          id={`ground-hatch-${direction}`}
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="#8B7355" strokeWidth={0.8} />
        </pattern>
      </defs>

      {/* Foundation */}
      <HatchRect
        x={bL - 3}
        y={groundY}
        w={bR - bL + 6}
        h={mToH(foundH)}
        id={`found-${direction}`}
      />

      {/* Ground line */}
      <line
        x1={bL - 25}
        y1={groundY}
        x2={bR + 25}
        y2={groundY}
        stroke="#8B7355"
        strokeWidth={2}
      />
      <rect
        x={bL - 25}
        y={groundY}
        width={bR - bL + 50}
        height={12}
        fill={`url(#ground-hatch-${direction})`}
        opacity={0.5}
      />

      {/* Floors */}
      {floorPos.map((fp, fi) => {
        const { floor, top, bottom, h, rooms } = fp;
        const isKeller =
          floor.name.toLowerCase().includes("keller") || floor.level < 0;
        const isDach = floor.name.toLowerCase().includes("dach");
        const isTopFloor = fi === floorPos.length - 1;

        return (
          <g key={fi}>
            {/* Floor slab */}
            <rect
              x={bL}
              y={bottom - SLAB_T / 2}
              width={bR - bL}
              height={SLAB_T}
              fill="#888"
              opacity={0.4}
            />
            {isTopFloor && (
              <rect
                x={bL}
                y={top - SLAB_T / 2}
                width={bR - bL}
                height={SLAB_T}
                fill="#888"
                opacity={0.3}
              />
            )}

            {/* Outer walls */}
            <HatchRect x={bL} y={top} w={WALL_T} h={h} id={`lw-${direction}-${fi}`} />
            <HatchRect
              x={bR - WALL_T}
              y={top}
              w={WALL_T}
              h={h}
              id={`rw-${direction}-${fi}`}
            />

            {/* Rooms */}
            {rooms.map((rl, ri) => {
              const rx =
                mToX(rl.xStart) + (ri === 0 ? WALL_T : 0);
              const rw =
                rl.width * scaleX -
                (ri === 0 ? WALL_T : 0) -
                (ri === rooms.length - 1 ? WALL_T : 0);
              const ry = top + SLAB_T / 2;
              const rh = h - SLAB_T;

              return (
                <g key={ri}>
                  <rect
                    x={rx}
                    y={ry}
                    width={Math.max(rw, 1)}
                    height={rh}
                    fill={roomColor(rl.room, isKeller, isDach)}
                  />

                  {ri < rooms.length - 1 && (
                    <rect
                      x={rx + rw - INNER_W / 2}
                      y={ry}
                      width={INNER_W}
                      height={rh}
                      fill={STROKE}
                      opacity={0.6}
                    />
                  )}

                  {rw > 25 && (
                    <text
                      x={rx + rw / 2}
                      y={ry + rh / 2 - 2}
                      textAnchor="middle"
                      fontSize={
                        (rw > 60 ? 11 : rw > 40 ? 9 : 7) * fontSize
                      }
                      fill="#374151"
                      fontFamily="Helvetica, Arial, sans-serif"
                      fontWeight={500}
                    >
                      {rl.room.name}
                    </text>
                  )}
                  {rw > 40 && (
                    <text
                      x={rx + rw / 2}
                      y={ry + rh / 2 + 11}
                      textAnchor="middle"
                      fontSize={7 * fontSize}
                      fill="#9ca3af"
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      {rl.room.area.toFixed(1)} m²
                    </text>
                  )}

                  {ri === 0 && !isKeller && (
                    <WindowEl x={bL} y={top} h={h} />
                  )}
                  {ri === rooms.length - 1 && !isKeller && (
                    <WindowEl x={bR - WALL_T} y={top} h={h} />
                  )}
                </g>
              );
            })}

            {/* Stairs */}
            {fi < floorPos.length - 1 && (
              <StairsEl
                x={mToX(stairXm)}
                y={top}
                w={mToH(stairWm) * 2}
                h={h}
              />
            )}

            {/* Height dimension */}
            <line
              x1={bR + 15}
              y1={top}
              x2={bR + 15}
              y2={bottom}
              stroke="#c00"
              strokeWidth={0.5}
            />
            <line
              x1={bR + 10}
              y1={top}
              x2={bR + 20}
              y2={top}
              stroke="#c00"
              strokeWidth={0.5}
            />
            <line
              x1={bR + 10}
              y1={bottom}
              x2={bR + 20}
              y2={bottom}
              stroke="#c00"
              strokeWidth={0.5}
            />
            <text
              x={bR + 24}
              y={(top + bottom) / 2 + 3}
              fontSize={7 * fontSize}
              fill="#c00"
              fontFamily="Helvetica, Arial, sans-serif"
            >
              {floor.ceilingHeight.toFixed(2)} m
            </text>

            {/* Floor name */}
            <text
              x={bL - 6}
              y={(top + bottom) / 2 + 3}
              textAnchor="end"
              fontSize={8 * fontSize}
              fill="#374151"
              fontFamily="Helvetica, Arial, sans-serif"
              fontWeight={600}
            >
              {floor.name}
            </text>
          </g>
        );
      })}

      {/* Roof */}
      {roofType === "Flachdach" ? (
        <rect
          x={bL - 8}
          y={roofBaseY - 6}
          width={bR - bL + 16}
          height={6}
          fill="#d4d4d4"
          stroke={STROKE}
          strokeWidth={1}
        />
      ) : (
        <g>
          <line
            x1={bL - 12}
            y1={roofBaseY + 4}
            x2={peakX}
            y2={roofPeakY}
            stroke={STROKE}
            strokeWidth={1.5}
          />
          <line
            x1={peakX}
            y1={roofPeakY}
            x2={bR + 12}
            y2={roofBaseY + 4}
            stroke={STROKE}
            strokeWidth={1.5}
          />
          <line
            x1={bL + 8}
            y1={roofBaseY - 2}
            x2={peakX}
            y2={roofPeakY + 8}
            stroke={STROKE}
            strokeWidth={0.4}
            strokeDasharray="3,2"
          />
          <line
            x1={peakX}
            y1={roofPeakY + 8}
            x2={bR - 8}
            y2={roofBaseY - 2}
            stroke={STROKE}
            strokeWidth={0.4}
            strokeDasharray="3,2"
          />
          {Array.from({ length: 6 }).map((_, i) => {
            const t = (i + 1) / 7;
            return (
              <g key={i}>
                <line
                  x1={bL + t * (peakX - bL) - 2}
                  y1={roofBaseY + t * (roofPeakY - roofBaseY) + 2}
                  x2={bL + t * (peakX - bL) + 2}
                  y2={roofBaseY + t * (roofPeakY - roofBaseY) - 2}
                  stroke={STROKE}
                  strokeWidth={2}
                  opacity={0.25}
                />
                <line
                  x1={peakX + t * (bR - peakX) - 2}
                  y1={roofPeakY + t * (roofBaseY - roofPeakY) - 2}
                  x2={peakX + t * (bR - peakX) + 2}
                  y2={roofPeakY + t * (roofBaseY - roofPeakY) + 2}
                  stroke={STROKE}
                  strokeWidth={2}
                  opacity={0.25}
                />
              </g>
            );
          })}
          <rect
            x={peakX - 3}
            y={roofPeakY - 2}
            width={6}
            height={4}
            fill={STROKE}
            rx={1}
          />
          {roofPitchDegrees && (
            <text
              x={bL + (peakX - bL) * 0.3}
              y={roofBaseY - (roofBaseY - roofPeakY) * 0.35}
              fontSize={9 * fontSize}
              fill="#555"
            >
              {roofPitchDegrees}°
            </text>
          )}
        </g>
      )}

      {/* Total height */}
      <line
        x1={bL - 25}
        y1={roofPeakY}
        x2={bL - 25}
        y2={groundY}
        stroke="#c00"
        strokeWidth={0.5}
      />
      <line
        x1={bL - 30}
        y1={roofPeakY}
        x2={bL - 20}
        y2={roofPeakY}
        stroke="#c00"
        strokeWidth={0.5}
      />
      <line
        x1={bL - 30}
        y1={groundY}
        x2={bL - 20}
        y2={groundY}
        stroke="#c00"
        strokeWidth={0.5}
      />
      <text
        x={bL - 32}
        y={(roofPeakY + groundY) / 2 + 3}
        textAnchor="end"
        fontSize={7 * fontSize}
        fill="#c00"
        fontWeight={600}
        fontFamily="Helvetica, Arial, sans-serif"
      >
        {(totalFloorH + roofH).toFixed(2)} m
      </text>

      {/* Width dimension */}
      <line
        x1={bL}
        y1={groundY + 22}
        x2={bR}
        y2={groundY + 22}
        stroke="#555"
        strokeWidth={0.5}
      />
      <line
        x1={bL}
        y1={groundY + 17}
        x2={bL}
        y2={groundY + 27}
        stroke="#555"
        strokeWidth={0.5}
      />
      <line
        x1={bR}
        y1={groundY + 17}
        x2={bR}
        y2={groundY + 27}
        stroke="#555"
        strokeWidth={0.5}
      />
      <text
        x={(bL + bR) / 2}
        y={groundY + 34}
        textAnchor="middle"
        fontSize={7 * fontSize}
        fill="#555"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        {spanWidth.toFixed(2)} m
      </text>

      {/* Section label */}
      <text
        x={svgW - margin.right}
        y={svgH - 6}
        textAnchor="end"
        fontSize={8 * fontSize}
        fill="#9ca3af"
        fontFamily="Helvetica, Arial, sans-serif"
        fontWeight={600}
      >
        {SECTION_LABELS[direction]}
      </text>
    </svg>
  );
}

export default function CrossSection({ analysis }: CrossSectionProps) {
  const directions: ViewDirection[] = ["front", "back", "left", "right"];

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-1">Gebäudeschnitte</h3>
      <p className="text-xs text-gray-500 mb-4">
        Schnittdarstellungen von allen vier Seiten
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {directions.map((dir) => (
          <div key={dir} className="border rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              {VIEW_LABELS[dir]}
            </h4>
            <SectionView analysis={analysis} direction={dir} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
