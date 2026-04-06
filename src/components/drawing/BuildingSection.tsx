"use client";

import React from "react";
import { BuildingData, FloorData, RoomData, RoofSegment, roomArea, buildingWidth, buildingDepth, roofHeight as calcRoofHeight } from "@/types/building";

const WALL_T = 4;
const SLAB_T = 3;
const STROKE = "#1e293b";

const CATEGORY_FILLS: Record<string, string> = {
  wohnraum: "#f8fafc",
  nutzraum: "#f3f4f6",
  balkon: "#f0fdf4",
  terrasse: "#f0fdf4",
  loggia: "#eef2ff",
  wintergarten: "#ecfeff",
  keller: "#faf5f0",
  garage: "#f9fafb",
};

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

interface SectionViewProps {
  building: BuildingData;
  direction: "width" | "depth"; // Which axis to cut along
  cutPosition: number; // Where to cut (meters along the other axis)
  label: string;
}

function SectionView({ building, direction, cutPosition, label }: SectionViewProps) {
  const bW = buildingWidth(building);
  const bD = buildingDepth(building);
  const sortedFloors = [...building.floors].sort((a, b) => a.level - b.level);

  // The span shown in the section
  const spanWidth = direction === "width" ? bW : bD;

  const svgW = 750;
  const svgH = 400;
  const margin = { top: 40, right: 60, bottom: 50, left: 60 };

  const totalFloorH = sortedFloors.reduce((s, f) => s + f.ceilingHeight, 0);

  // Find max roof height
  const maxRoofH = building.roofSegments.length > 0
    ? Math.max(...building.roofSegments.map((seg) => calcRoofHeight(seg)))
    : 0;

  const foundH = 0.3;
  const totalH = totalFloorH + maxRoofH + foundH;

  const drawW = svgW - margin.left - margin.right;
  const drawH = svgH - margin.top - margin.bottom;
  const scaleX = drawW / spanWidth;
  const scaleY = drawH / totalH;

  const bL = margin.left;
  const bR = bL + spanWidth * scaleX;
  const groundY = margin.top + drawH - foundH * scaleY;
  const toSvgX = (m: number) => bL + m * scaleX;
  const toSvgH = (m: number) => m * scaleY;

  // Floor positions
  let curY = groundY;
  const floorPositions: { floor: FloorData; top: number; bottom: number; h: number }[] = [];
  for (const f of sortedFloors) {
    const h = toSvgH(f.ceilingHeight);
    curY -= h;
    floorPositions.push({ floor: f, top: curY, bottom: curY + h, h });
  }

  const roofBaseY = floorPositions.length > 0 ? floorPositions[floorPositions.length - 1].top : groundY;

  // Get rooms that the cut line intersects for each floor
  function getRoomsForFloor(floor: FloorData): RoomData[] {
    const fx = floor.x || 0;
    const fz = floor.z || 0;
    const nonVoid = floor.rooms.filter((r) => !r.isVoid);

    if (nonVoid.length === 0) {
      // Implicit room = full floor
      return [{
        id: `__implicit_${floor.id}`,
        name: floor.name,
        width: floor.width,
        depth: floor.depth,
        x: 0, z: 0,
        category: "wohnraum",
        isVoid: false,
        hasSlope: false,
      }];
    }

    // Filter rooms that the cut line passes through
    const filtered = nonVoid.filter((r) => {
      if (direction === "width") {
        // Cut along width at cutPosition along depth
        const roomAbsZ = fz + r.z;
        return roomAbsZ <= cutPosition && roomAbsZ + r.depth >= cutPosition;
      } else {
        const roomAbsX = fx + r.x;
        return roomAbsX <= cutPosition && roomAbsX + r.width >= cutPosition;
      }
    });

    return filtered.length > 0 ? filtered : nonVoid;
  }

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
      {/* Foundation */}
      <HatchRect x={bL - 2} y={groundY} w={bR - bL + 4} h={toSvgH(foundH)} id={`found-${label}`} />

      {/* Ground line */}
      <line x1={bL - 20} y1={groundY} x2={bR + 20} y2={groundY} stroke="#8B7355" strokeWidth={2} />

      {/* Floors */}
      {floorPositions.map((fp, fi) => {
        const { floor, top, bottom, h } = fp;
        const fx = floor.x || 0;
        const isTopFloor = fi === floorPositions.length - 1;
        const rooms = getRoomsForFloor(floor);

        // Sort and lay out rooms along the section axis
        const sorted = [...rooms].sort((a, b) =>
          direction === "width" ? a.x - b.x : a.z - b.z
        );

        // Map rooms to section coordinates
        const roomLayouts = sorted.map((r) => {
          const pos = direction === "width" ? fx + r.x : (floor.z || 0) + r.z;
          const w = direction === "width" ? r.width : r.depth;
          return { room: r, xStart: pos, width: w };
        });

        return (
          <g key={fi}>
            {/* Floor slab */}
            <rect x={bL} y={bottom - SLAB_T / 2} width={bR - bL} height={SLAB_T} fill="#999" opacity={0.3} />
            {isTopFloor && <rect x={bL} y={top - SLAB_T / 2} width={bR - bL} height={SLAB_T} fill="#999" opacity={0.2} />}

            {/* Outer walls */}
            {roomLayouts.length > 0 && (
              <>
                <HatchRect x={toSvgX(roomLayouts[0].xStart)} y={top} w={WALL_T} h={h} id={`lw-${label}-${fi}`} />
                <HatchRect x={toSvgX(roomLayouts[roomLayouts.length - 1].xStart + roomLayouts[roomLayouts.length - 1].width) - WALL_T} y={top} w={WALL_T} h={h} id={`rw-${label}-${fi}`} />
              </>
            )}

            {/* Rooms */}
            {roomLayouts.map((rl, ri) => {
              const rx = toSvgX(rl.xStart) + (ri === 0 ? WALL_T : 0);
              const rw = rl.width * scaleX - (ri === 0 ? WALL_T : 0) - (ri === roomLayouts.length - 1 ? WALL_T : 0);
              const ry = top + SLAB_T / 2;
              const rh = h - SLAB_T;
              const fill = CATEGORY_FILLS[rl.room.category] || "#f8fafc";

              return (
                <g key={ri}>
                  <rect x={rx} y={ry} width={Math.max(rw, 1)} height={rh} fill={fill} />
                  {/* Inner wall */}
                  {ri < roomLayouts.length - 1 && (
                    <rect x={rx + rw} y={ry} width={2} height={rh} fill={STROKE} opacity={0.5} />
                  )}
                  {/* Room name */}
                  {rw > 25 && (
                    <text x={rx + rw / 2} y={ry + rh / 2 - 2} textAnchor="middle" fontSize={rw > 60 ? 10 : 8} fill="#374151" fontFamily="Helvetica, Arial, sans-serif" fontWeight={500}>
                      {rl.room.name}
                    </text>
                  )}
                  {rw > 40 && (
                    <text x={rx + rw / 2} y={ry + rh / 2 + 10} textAnchor="middle" fontSize={7} fill="#9ca3af" fontFamily="Helvetica, Arial, sans-serif">
                      {roomArea(rl.room).toFixed(1)} m²
                    </text>
                  )}
                </g>
              );
            })}

            {/* Height dimension */}
            <line x1={bR + 15} y1={top} x2={bR + 15} y2={bottom} stroke="#dc2626" strokeWidth={0.5} />
            <line x1={bR + 10} y1={top} x2={bR + 20} y2={top} stroke="#dc2626" strokeWidth={0.5} />
            <line x1={bR + 10} y1={bottom} x2={bR + 20} y2={bottom} stroke="#dc2626" strokeWidth={0.5} />
            <text x={bR + 24} y={(top + bottom) / 2 + 3} fontSize={7} fill="#dc2626" fontFamily="Helvetica, Arial, sans-serif">
              {floor.ceilingHeight.toFixed(2)} m
            </text>

            {/* Floor name */}
            <text x={bL - 8} y={(top + bottom) / 2 + 3} textAnchor="end" fontSize={8} fill="#374151" fontFamily="Helvetica, Arial, sans-serif" fontWeight={600}>
              {floor.name}
            </text>
          </g>
        );
      })}

      {/* Roof segments */}
      {building.roofSegments.map((seg, i) => {
        // In 3D: rotation 0 = gable profile along X (width), extruded along Z (depth), ridge runs Z.
        // So looking from south (Querschnitt/width): we see the GABLE at rotation 0.
        // Looking from west (Längsschnitt/depth): we see the SIDE at rotation 0.
        // At rotation 90: the gable rotates to face west, so Längsschnitt sees gable.
        const rotNorm = ((seg.rotation % 360) + 360) % 360;
        const isGableView = direction === "width"
          ? rotNorm <= 45 || rotNorm >= 315 || (rotNorm > 135 && rotNorm < 225)  // rot ~0° or ~180° → gable in width section
          : (rotNorm > 45 && rotNorm < 135) || (rotNorm > 225 && rotNorm < 315);  // rot ~90° or ~270° → gable in depth section

        // Compute the bounding box of the rotated roof in world space
        const cx = seg.x + seg.width / 2;
        const cz = seg.z + seg.depth / 2;
        const hw = seg.width / 2;
        const hd = seg.depth / 2;
        const cosR = Math.abs(Math.cos(rotNorm * Math.PI / 180));
        const sinR = Math.abs(Math.sin(rotNorm * Math.PI / 180));
        // Rotated bounding box half-extents
        const bbHalfW = hw * cosR + hd * sinR;
        const bbHalfD = hw * sinR + hd * cosR;

        const segX = direction === "width" ? cx - bbHalfW : cz - bbHalfD;
        const segW = direction === "width" ? bbHalfW * 2 : bbHalfD * 2;

        const peakH = calcRoofHeight(seg);

        // Overhang
        const overhang = 6;
        const leftX = toSvgX(segX) - overhang;
        const rightX = toSvgX(segX + segW) + overhang;

        if (seg.type === "Flachdach") {
          return (
            <rect key={i} x={leftX} y={roofBaseY - 5} width={rightX - leftX} height={5} fill="#d4d4d4" stroke={STROKE} strokeWidth={1} />
          );
        }

        if (isGableView) {
          // Gable view — triangle peak in the middle
          const peakSvgX = toSvgX(segX + segW / 2);
          const peakY = roofBaseY - toSvgH(peakH);

          return (
            <g key={i}>
              <line x1={leftX} y1={roofBaseY} x2={peakSvgX} y2={peakY} stroke={STROKE} strokeWidth={1.5} />
              <line x1={peakSvgX} y1={peakY} x2={rightX} y2={roofBaseY} stroke={STROKE} strokeWidth={1.5} />
              {/* Ridge cap */}
              <rect x={peakSvgX - 2} y={peakY - 2} width={4} height={3} fill={STROKE} rx={1} />
              {/* Pitch label */}
              <text x={leftX + (peakSvgX - leftX) * 0.35} y={roofBaseY - (roofBaseY - peakY) * 0.3 - 3} fontSize={8} fill="#555" fontFamily="Helvetica, Arial, sans-serif">
                {seg.pitchDegrees}°
              </text>
            </g>
          );
        } else {
          // Side view — flat ridge line at peak height
          const peakY = roofBaseY - toSvgH(peakH);

          return (
            <g key={i}>
              {/* Ridge line across the top */}
              <line x1={leftX} y1={peakY} x2={rightX} y2={peakY} stroke={STROKE} strokeWidth={1.5} />
              {/* Left slope connection */}
              <line x1={leftX} y1={roofBaseY} x2={leftX} y2={peakY} stroke={STROKE} strokeWidth={1.5} />
              {/* Right slope connection */}
              <line x1={rightX} y1={roofBaseY} x2={rightX} y2={peakY} stroke={STROKE} strokeWidth={1.5} />
              {/* Ridge cap dots */}
              <rect x={leftX - 1} y={peakY - 2} width={3} height={3} fill={STROKE} rx={1} />
              <rect x={rightX - 1} y={peakY - 2} width={3} height={3} fill={STROKE} rx={1} />
            </g>
          );
        }
      })}

      {/* Total height dimension (left side, including roof) */}
      {(() => {
        const topY = maxRoofH > 0 ? roofBaseY - toSvgH(maxRoofH) : roofBaseY;
        const totalHeightM = totalFloorH + maxRoofH;
        const x = bL - 30;
        return (
          <g>
            <line x1={x} y1={topY} x2={x} y2={groundY} stroke="#dc2626" strokeWidth={0.5} />
            <line x1={x - 5} y1={topY} x2={x + 5} y2={topY} stroke="#dc2626" strokeWidth={0.5} />
            <line x1={x - 5} y1={groundY} x2={x + 5} y2={groundY} stroke="#dc2626" strokeWidth={0.5} />
            <text x={x - 3} y={(topY + groundY) / 2 + 3} textAnchor="end" fontSize={8} fill="#dc2626" fontWeight={600} fontFamily="Helvetica, Arial, sans-serif">
              {totalHeightM.toFixed(2)} m
            </text>
          </g>
        );
      })()}

      {/* Width dimension at bottom */}
      <line x1={bL} y1={groundY + 25} x2={bR} y2={groundY + 25} stroke="#555" strokeWidth={0.5} />
      <line x1={bL} y1={groundY + 20} x2={bL} y2={groundY + 30} stroke="#555" strokeWidth={0.5} />
      <line x1={bR} y1={groundY + 20} x2={bR} y2={groundY + 30} stroke="#555" strokeWidth={0.5} />
      <text x={(bL + bR) / 2} y={groundY + 38} textAnchor="middle" fontSize={8} fill="#555" fontFamily="Helvetica, Arial, sans-serif">
        {spanWidth.toFixed(2)} m
      </text>

      {/* Section label */}
      <text x={svgW - margin.right} y={svgH - 6} textAnchor="end" fontSize={8} fill="#9ca3af" fontFamily="Helvetica, Arial, sans-serif" fontWeight={600}>
        {label}
      </text>
    </svg>
  );
}

export default function BuildingSection({ building }: { building: BuildingData }) {
  const bW = buildingWidth(building);
  const bD = buildingDepth(building);

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-1">Gebäudeschnitte</h3>
      <p className="text-xs text-gray-500 mb-4">Querschnitt und Längsschnitt durch die Gebäudemitte</p>
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-2">Querschnitt (Ost-West)</h4>
          <SectionView building={building} direction="width" cutPosition={bD / 2} label="SCHNITT A-A" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-2">Längsschnitt (Nord-Süd)</h4>
          <SectionView building={building} direction="depth" cutPosition={bW / 2} label="SCHNITT B-B" />
        </div>
      </div>
    </div>
  );
}
