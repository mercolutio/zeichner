"use client";

import React from "react";
import { BuildingData, FloorData, RoomData, roomArea, floorArea } from "@/types/building";

const CATEGORY_COLORS: Record<string, { fill: string; stroke: string }> = {
  wohnraum: { fill: "#dbeafe", stroke: "#3b82f6" },
  nutzraum: { fill: "#f3f4f6", stroke: "#6b7280" },
  balkon: { fill: "#d1fae5", stroke: "#10b981" },
  terrasse: { fill: "#d1fae5", stroke: "#10b981" },
  loggia: { fill: "#e0e7ff", stroke: "#6366f1" },
  keller: { fill: "#f5f0eb", stroke: "#a3896b" },
  garage: { fill: "#f3f4f6", stroke: "#9ca3af" },
};

function FloorPlan({ floor, maxWidth }: { floor: FloorData; maxWidth: number }) {
  const padding = 60;
  const svgW = maxWidth;
  const svgH = 400;

  const drawW = svgW - padding * 2;
  const drawH = svgH - padding * 2;

  const scaleX = drawW / (floor.width || 1);
  const scaleY = drawH / (floor.depth || 1);
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (drawW - floor.width * scale) / 2;
  const offsetY = padding + (drawH - floor.depth * scale) / 2;

  const toX = (m: number) => offsetX + m * scale;
  const toY = (m: number) => offsetY + m * scale;

  const solidRooms = floor.rooms.filter((r) => !r.isVoid);
  const voidRooms = floor.rooms.filter((r) => r.isVoid);

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">{floor.name}</h3>
          <p className="text-xs text-gray-500">
            {floor.width.toFixed(2)} × {floor.depth.toFixed(2)} m · Raumhöhe {floor.ceilingHeight.toFixed(2)} m · {floorArea(floor).toFixed(1)} m²
          </p>
        </div>
        <span className="text-sm font-mono text-gray-400">Ebene {floor.level}</span>
      </div>

      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: "400px" }}>
        {/* Building outline */}
        <rect
          x={toX(0)} y={toY(0)}
          width={floor.width * scale} height={floor.depth * scale}
          fill="none" stroke="#1e293b" strokeWidth={2}
        />

        {/* Void rooms (hatched) */}
        <defs>
          <pattern id={`void-hatch-${floor.id}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" strokeWidth={0.8} opacity={0.4} />
          </pattern>
        </defs>
        {voidRooms.map((room) => (
          <g key={room.id}>
            <rect
              x={toX(room.x)} y={toY(room.z)}
              width={room.width * scale} height={room.depth * scale}
              fill={`url(#void-hatch-${floor.id})`}
              stroke="#ef4444" strokeWidth={1} strokeDasharray="4,2"
            />
            <text
              x={toX(room.x + room.width / 2)}
              y={toY(room.z + room.depth / 2)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fill="#ef4444" fontFamily="Helvetica, Arial, sans-serif"
            >
              {room.name} (Void)
            </text>
          </g>
        ))}

        {/* Rooms */}
        {solidRooms.map((room) => {
          const colors = CATEGORY_COLORS[room.category] || CATEGORY_COLORS.wohnraum;
          const rx = toX(room.x);
          const ry = toY(room.z);
          const rw = room.width * scale;
          const rh = room.depth * scale;

          return (
            <g key={room.id}>
              <rect
                x={rx} y={ry}
                width={rw} height={rh}
                fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5}
              />
              {/* Room name */}
              {rw > 30 && rh > 20 && (
                <text
                  x={rx + rw / 2} y={ry + rh / 2 - 6}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(12, rw / 6)} fill="#1e293b"
                  fontFamily="Helvetica, Arial, sans-serif" fontWeight={500}
                >
                  {room.name}
                </text>
              )}
              {/* Dimensions */}
              {rw > 40 && rh > 30 && (
                <text
                  x={rx + rw / 2} y={ry + rh / 2 + 8}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(9, rw / 8)} fill="#6b7280"
                  fontFamily="Helvetica, Arial, sans-serif"
                >
                  {room.width.toFixed(2)} × {room.depth.toFixed(2)} m
                </text>
              )}
              {/* Area */}
              {rw > 40 && rh > 40 && (
                <text
                  x={rx + rw / 2} y={ry + rh / 2 + 20}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(9, rw / 8)} fill="#9ca3af"
                  fontFamily="Helvetica, Arial, sans-serif"
                >
                  {roomArea(room).toFixed(1)} m²
                </text>
              )}
            </g>
          );
        })}

        {/* Outer dimension lines */}
        {/* Width */}
        <line x1={toX(0)} y1={toY(floor.depth) + 25} x2={toX(floor.width)} y2={toY(floor.depth) + 25} stroke="#555" strokeWidth={0.5} />
        <line x1={toX(0)} y1={toY(floor.depth) + 20} x2={toX(0)} y2={toY(floor.depth) + 30} stroke="#555" strokeWidth={0.5} />
        <line x1={toX(floor.width)} y1={toY(floor.depth) + 20} x2={toX(floor.width)} y2={toY(floor.depth) + 30} stroke="#555" strokeWidth={0.5} />
        <text
          x={toX(floor.width / 2)} y={toY(floor.depth) + 38}
          textAnchor="middle" fontSize={10} fill="#555"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {floor.width.toFixed(2)} m
        </text>

        {/* Depth */}
        <line x1={toX(floor.width) + 25} y1={toY(0)} x2={toX(floor.width) + 25} y2={toY(floor.depth)} stroke="#555" strokeWidth={0.5} />
        <line x1={toX(floor.width) + 20} y1={toY(0)} x2={toX(floor.width) + 30} y2={toY(0)} stroke="#555" strokeWidth={0.5} />
        <line x1={toX(floor.width) + 20} y1={toY(floor.depth)} x2={toX(floor.width) + 30} y2={toY(floor.depth)} stroke="#555" strokeWidth={0.5} />
        <text
          x={toX(floor.width) + 38} y={toY(floor.depth / 2)}
          textAnchor="middle" fontSize={10} fill="#555"
          fontFamily="Helvetica, Arial, sans-serif"
          transform={`rotate(90, ${toX(floor.width) + 38}, ${toY(floor.depth / 2)})`}
        >
          {floor.depth.toFixed(2)} m
        </text>

        {/* Room dimension lines (width along bottom of each room) */}
        {solidRooms.map((room) => {
          const rx = toX(room.x);
          const rw = room.width * scale;
          const ry2 = toY(room.z + room.depth);
          if (rw < 30) return null;
          return (
            <g key={`dim-${room.id}`}>
              <line x1={rx} y1={ry2 - 2} x2={rx + rw} y2={ry2 - 2} stroke="#dc2626" strokeWidth={0.4} />
              <text x={rx + rw / 2} y={ry2 - 5} textAnchor="middle" fontSize={7} fill="#dc2626" fontFamily="Helvetica, Arial, sans-serif">
                {room.width.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function FloorplanView({ building }: { building: BuildingData }) {
  const sortedFloors = [...building.floors].sort((a, b) => b.level - a.level);

  return (
    <div className="space-y-6">
      {sortedFloors.map((floor) => (
        <FloorPlan key={floor.id} floor={floor} maxWidth={700} />
      ))}
    </div>
  );
}
