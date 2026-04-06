"use client";

import React from "react";
import { BuildingData, FloorData, RoomData, roomArea } from "@/types/building";

const WALL_OUTER = 3;   // px — outer wall thickness
const WALL_INNER = 1.5;  // px — inner wall thickness

const CATEGORY_FILLS: Record<string, string> = {
  wohnraum: "#f8fafc",
  nutzraum: "#f8fafc",
  balkon: "#f0fdf4",
  terrasse: "#f0fdf4",
  loggia: "#eef2ff",
  wintergarten: "#ecfeff",
  keller: "#faf5f0",
  garage: "#f9fafb",
};

function FloorPlan({ floor }: { floor: FloorData }) {
  const explicitRooms = floor.rooms.filter((r) => !r.isVoid);
  const voidRooms = floor.rooms.filter((r) => r.isVoid);

  // If no explicit rooms: the entire floor minus voids is one room
  const rooms: RoomData[] = explicitRooms.length > 0
    ? explicitRooms
    : [{
        id: "__floor__",
        name: floor.name,
        width: floor.width,
        depth: floor.depth,
        x: 0,
        z: 0,
        category: "wohnraum" as const,
        isVoid: false,
        hasSlope: false,
      }];

  const hasImplicitRoom = explicitRooms.length === 0;

  // Compute bounding box from rooms
  const minX = Math.min(...rooms.map((r) => r.x));
  const minZ = Math.min(...rooms.map((r) => r.z));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const maxZ = Math.max(...rooms.map((r) => r.z + r.depth));
  const totalW = maxX - minX;
  const totalD = maxZ - minZ;

  if (totalW <= 0 || totalD <= 0) return null;

  const padding = 70;
  const svgW = 750;
  const svgH = Math.max(250, Math.min(500, 250 + totalD / totalW * 400));

  const drawW = svgW - padding * 2;
  const drawH = svgH - padding * 2;
  const scale = Math.min(drawW / totalW, drawH / totalD);

  const offsetX = padding + (drawW - totalW * scale) / 2;
  const offsetY = padding + (drawH - totalD * scale) / 2;

  const toX = (m: number) => offsetX + (m - minX) * scale;
  const toY = (m: number) => offsetY + (m - minZ) * scale;

  // Detect edges: for each room edge, check if it's an outer wall or shared with another room
  function isOuterEdge(room: RoomData, edge: "top" | "bottom" | "left" | "right"): boolean {
    const EPS = 0.05;
    for (const other of rooms) {
      if (other.id === room.id) continue;
      if (edge === "top" && Math.abs(other.z + other.depth - room.z) < EPS &&
          other.x < room.x + room.width - EPS && other.x + other.width > room.x + EPS) return false;
      if (edge === "bottom" && Math.abs(other.z - (room.z + room.depth)) < EPS &&
          other.x < room.x + room.width - EPS && other.x + other.width > room.x + EPS) return false;
      if (edge === "left" && Math.abs(other.x + other.width - room.x) < EPS &&
          other.z < room.z + room.depth - EPS && other.z + other.depth > room.z + EPS) return false;
      if (edge === "right" && Math.abs(other.x - (room.x + room.width)) < EPS &&
          other.z < room.z + room.depth - EPS && other.z + other.depth > room.z + EPS) return false;
    }
    return true;
  }

  const voidArea = voidRooms.reduce((s, r) => s + roomArea(r), 0);
  const totalArea = rooms.reduce((s, r) => s + roomArea(r), 0) - (hasImplicitRoom ? voidArea : 0);

  // Dimension lines along the top
  const sortedByX = [...rooms].sort((a, b) => a.x - b.x);
  const topDims: { x1: number; x2: number; label: string }[] = [];
  // Collect unique X breakpoints
  const xBreaks = [...new Set(rooms.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  for (let i = 0; i < xBreaks.length - 1; i++) {
    const w = xBreaks[i + 1] - xBreaks[i];
    if (w > 0.1) {
      topDims.push({ x1: xBreaks[i], x2: xBreaks[i + 1], label: w.toFixed(2) });
    }
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">{floor.name}</h3>
          <p className="text-xs text-gray-500">
            {totalW.toFixed(2)} × {totalD.toFixed(2)} m · Raumhöhe {floor.ceilingHeight.toFixed(2)} m · {totalArea.toFixed(1)} m²
          </p>
        </div>
        <span className="text-sm font-mono text-gray-400">Ebene {floor.level}</span>
      </div>

      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
        {/* Room fills */}
        {rooms.map((room) => (
          <rect key={`fill-${room.id}`}
            x={toX(room.x)} y={toY(room.z)}
            width={room.width * scale} height={room.depth * scale}
            fill={CATEGORY_FILLS[room.category] || "#f8fafc"}
          />
        ))}

        {/* Void cutouts — white rects that erase the fill */}
        {hasImplicitRoom && voidRooms.map((v) => (
          <rect key={`void-${v.id}`}
            x={toX(v.x)} y={toY(v.z)}
            width={v.width * scale} height={v.depth * scale}
            fill="white" stroke="none"
          />
        ))}

        {/* Room walls */}
        {rooms.map((room) => {
          const rx = toX(room.x);
          const ry = toY(room.z);
          const rw = room.width * scale;
          const rh = room.depth * scale;

          const topOuter = isOuterEdge(room, "top");
          const bottomOuter = isOuterEdge(room, "bottom");
          const leftOuter = isOuterEdge(room, "left");
          const rightOuter = isOuterEdge(room, "right");

          return (
            <g key={`walls-${room.id}`}>
              {/* Top wall */}
              <line x1={rx} y1={ry} x2={rx + rw} y2={ry}
                stroke="#1e293b" strokeWidth={topOuter ? WALL_OUTER : WALL_INNER} />
              {/* Bottom wall */}
              <line x1={rx} y1={ry + rh} x2={rx + rw} y2={ry + rh}
                stroke="#1e293b" strokeWidth={bottomOuter ? WALL_OUTER : WALL_INNER} />
              {/* Left wall */}
              <line x1={rx} y1={ry} x2={rx} y2={ry + rh}
                stroke="#1e293b" strokeWidth={leftOuter ? WALL_OUTER : WALL_INNER} />
              {/* Right wall */}
              <line x1={rx + rw} y1={ry} x2={rx + rw} y2={ry + rh}
                stroke="#1e293b" strokeWidth={rightOuter ? WALL_OUTER : WALL_INNER} />
            </g>
          );
        })}

        {/* Void edges — drawn as outer walls where they cut into the floor */}
        {hasImplicitRoom && voidRooms.map((v) => {
          const vx = toX(v.x);
          const vy = toY(v.z);
          const vw = v.width * scale;
          const vh = v.depth * scale;
          // Only draw edges that are inside the floor (not at the boundary)
          const EPS = 0.05;
          const drawTop = v.z > minZ + EPS;
          const drawBottom = v.z + v.depth < maxZ - EPS;
          const drawLeft = v.x > minX + EPS;
          const drawRight = v.x + v.width < maxX - EPS;
          return (
            <g key={`void-walls-${v.id}`}>
              {drawTop && <line x1={vx} y1={vy} x2={vx + vw} y2={vy} stroke="#1e293b" strokeWidth={WALL_OUTER} />}
              {drawBottom && <line x1={vx} y1={vy + vh} x2={vx + vw} y2={vy + vh} stroke="#1e293b" strokeWidth={WALL_OUTER} />}
              {drawLeft && <line x1={vx} y1={vy} x2={vx} y2={vy + vh} stroke="#1e293b" strokeWidth={WALL_OUTER} />}
              {drawRight && <line x1={vx + vw} y1={vy} x2={vx + vw} y2={vy + vh} stroke="#1e293b" strokeWidth={WALL_OUTER} />}
            </g>
          );
        })}

        {/* Room labels */}
        {rooms.map((room) => {
          const rx = toX(room.x);
          const ry = toY(room.z);
          const rw = room.width * scale;
          const rh = room.depth * scale;
          const fs = Math.min(11, rw / 7, rh / 4);
          if (rw < 25 || rh < 20 || fs < 5) return null;

          return (
            <g key={`label-${room.id}`}>
              {/* Room name */}
              <text x={rx + rw / 2} y={ry + rh / 2 - fs * 0.7}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={fs} fill="#1e293b" fontWeight={500}
                fontFamily="Helvetica, Arial, sans-serif">
                {room.name}
              </text>
              {/* Area + dimensions */}
              {rw > 40 && rh > 35 && (
                <text x={rx + rw / 2} y={ry + rh / 2 + fs * 0.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={fs * 0.75} fill="#6b7280"
                  fontFamily="Helvetica, Arial, sans-serif">
                  {roomArea(room).toFixed(2)} m² ({room.width.toFixed(2)} × {room.depth.toFixed(2)})
                </text>
              )}
            </g>
          );
        })}

        {/* Top dimension chain */}
        {topDims.map((d, i) => {
          const y = toY(minZ) - 20;
          const x1 = toX(d.x1);
          const x2 = toX(d.x2);
          if (x2 - x1 < 15) return null;
          return (
            <g key={`tdim-${i}`}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="#374151" strokeWidth={0.5} />
              <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="#374151" strokeWidth={0.5} />
              <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="#374151" strokeWidth={0.5} />
              <text x={(x1 + x2) / 2} y={y - 6}
                textAnchor="middle" fontSize={7} fill="#374151"
                fontFamily="Helvetica, Arial, sans-serif">
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Overall width dimension */}
        <line x1={toX(minX)} y1={toY(maxZ) + 25} x2={toX(maxX)} y2={toY(maxZ) + 25} stroke="#374151" strokeWidth={0.5} />
        <line x1={toX(minX)} y1={toY(maxZ) + 20} x2={toX(minX)} y2={toY(maxZ) + 30} stroke="#374151" strokeWidth={0.5} />
        <line x1={toX(maxX)} y1={toY(maxZ) + 20} x2={toX(maxX)} y2={toY(maxZ) + 30} stroke="#374151" strokeWidth={0.5} />
        <text x={(toX(minX) + toX(maxX)) / 2} y={toY(maxZ) + 40}
          textAnchor="middle" fontSize={9} fill="#374151"
          fontFamily="Helvetica, Arial, sans-serif">
          {totalW.toFixed(2)} m
        </text>

        {/* Right side depth dimension */}
        {(() => {
          const zBreaks = [...new Set(rooms.flatMap((r) => [r.z, r.z + r.depth]))].sort((a, b) => a - b);
          const x = toX(maxX) + 20;
          return (
            <g>
              {zBreaks.map((z, i) => {
                if (i >= zBreaks.length - 1) return null;
                const d = zBreaks[i + 1] - zBreaks[i];
                if (d < 0.1) return null;
                const y1 = toY(zBreaks[i]);
                const y2 = toY(zBreaks[i + 1]);
                if (y2 - y1 < 15) return null;
                return (
                  <g key={`zdim-${i}`}>
                    <line x1={x} y1={y1} x2={x} y2={y2} stroke="#374151" strokeWidth={0.5} />
                    <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke="#374151" strokeWidth={0.5} />
                    <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke="#374151" strokeWidth={0.5} />
                    <text x={x + 8} y={(y1 + y2) / 2}
                      textAnchor="start" dominantBaseline="middle"
                      fontSize={7} fill="#374151"
                      fontFamily="Helvetica, Arial, sans-serif">
                      {d.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

export default function FloorplanView({ building }: { building: BuildingData }) {
  const sortedFloors = [...building.floors].sort((a, b) => b.level - a.level);

  return (
    <div className="space-y-6">
      {sortedFloors.map((floor) => (
        <FloorPlan key={floor.id} floor={floor} />
      ))}
    </div>
  );
}
