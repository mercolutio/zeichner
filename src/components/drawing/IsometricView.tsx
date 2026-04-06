"use client";

import React from "react";
import { FloorplanAnalysis } from "@/types/floorplan";

interface IsometricViewProps {
  analysis: FloorplanAnalysis;
}

// Isometric projection: convert 3D (x, y, z) to 2D screen coords
function iso(x: number, y: number, z: number): [number, number] {
  const isoX = (x - y) * Math.cos(Math.PI / 6);
  const isoY = (x + y) * Math.sin(Math.PI / 6) - z;
  return [isoX, isoY];
}

function toSvgPoint(x: number, y: number, z: number, ox: number, oy: number, s: number): string {
  const [ix, iy] = iso(x * s, y * s, z * s);
  return `${ox + ix},${oy + iy}`;
}

export default function IsometricView({ analysis }: IsometricViewProps) {
  const { floors, roofType, roofPitchDegrees, buildingWidth, buildingDepth } = analysis;
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);

  const svgWidth = 600;
  const svgHeight = 500;
  const ox = svgWidth / 2; // origin x
  const oy = svgHeight - 60; // origin y (bottom)

  // Scale factor to fit building
  const maxDim = Math.max(buildingWidth, buildingDepth, 10);
  const totalFloorH = sortedFloors.reduce((s, f) => s + f.ceilingHeight, 0);
  const roofH = roofType === "Flachdach" ? 0.3 : (buildingWidth / 2) * Math.tan(((roofPitchDegrees || 35) * Math.PI) / 180);
  const totalH = totalFloorH + roofH;
  const s = Math.min(180 / maxDim, 140 / totalH);

  const w = buildingWidth;
  const d = buildingDepth;

  // Build floor polygons from bottom to top
  let currentZ = 0;
  const floorPolygons: React.ReactElement[] = [];

  // Colors for floors
  const floorColors = ["#dbeafe", "#e0e7ff", "#fef3c7", "#fce7f3", "#d1fae5"];
  const wallColors = ["#93c5fd", "#a5b4fc", "#fcd34d", "#f9a8d4", "#6ee7b7"];
  const sideColors = ["#60a5fa", "#818cf8", "#f59e0b", "#ec4899", "#34d399"];

  for (let i = 0; i < sortedFloors.length; i++) {
    const floor = sortedFloors[i];
    const h = floor.ceilingHeight;
    const z0 = currentZ;
    const z1 = currentZ + h;
    const topColor = floorColors[i % floorColors.length];
    const frontColor = wallColors[i % wallColors.length];
    const rightColor = sideColors[i % sideColors.length];

    const p = (x: number, y: number, z: number) => toSvgPoint(x, y, z, ox, oy, s);

    // Front face (y = d)
    const front = `${p(0, d, z0)} ${p(w, d, z0)} ${p(w, d, z1)} ${p(0, d, z1)}`;
    // Right face (x = w)
    const right = `${p(w, 0, z0)} ${p(w, d, z0)} ${p(w, d, z1)} ${p(w, 0, z1)}`;
    // Top face
    const top = `${p(0, 0, z1)} ${p(w, 0, z1)} ${p(w, d, z1)} ${p(0, d, z1)}`;

    // Floor separator line (top of previous floor)
    floorPolygons.push(
      <g key={`floor-${i}`}>
        <polygon points={front} fill={frontColor} stroke="#374151" strokeWidth={0.8} opacity={0.85} />
        <polygon points={right} fill={rightColor} stroke="#374151" strokeWidth={0.8} opacity={0.75} />
        {i === sortedFloors.length - 1 && roofType === "Flachdach" && (
          <polygon points={top} fill={topColor} stroke="#374151" strokeWidth={0.8} opacity={0.6} />
        )}
        {/* Floor label on front face */}
        <text
          x={parseFloat(toSvgPoint(w / 2, d, (z0 + z1) / 2, ox, oy, s).split(",")[0])}
          y={parseFloat(toSvgPoint(w / 2, d, (z0 + z1) / 2, ox, oy, s).split(",")[1])}
          textAnchor="middle"
          fontSize={11}
          fill="#1e3a5f"
          fontWeight={600}
        >
          {floor.name}
        </text>
        {/* Height label on right side */}
        <text
          x={parseFloat(toSvgPoint(w + 0.5, d / 2, (z0 + z1) / 2, ox, oy, s).split(",")[0]) + 15}
          y={parseFloat(toSvgPoint(w + 0.5, d / 2, (z0 + z1) / 2, ox, oy, s).split(",")[1])}
          fontSize={9}
          fill="#4b5563"
        >
          {h.toFixed(2)} m
        </text>
      </g>
    );

    currentZ = z1;
  }

  // Roof
  const roofPolygons: React.ReactElement[] = [];
  if (roofType !== "Flachdach") {
    const z = currentZ;
    const rh = roofH;
    const p = (x: number, y: number, zz: number) => toSvgPoint(x, y, zz, ox, oy, s);

    // Gable / hip roof
    const ridgeY0 = 0;
    const ridgeY1 = d;

    // Front triangle
    const frontRoof = `${p(0, d, z)} ${p(w, d, z)} ${p(w / 2, d, z + rh)}`;
    // Back triangle
    // Right roof slope
    const rightSlope = `${p(w, 0, z)} ${p(w, d, z)} ${p(w / 2, d, z + rh)} ${p(w / 2, 0, z + rh)}`;
    // Left roof slope (not visible in this angle, but we draw it lightly)
    // Top ridge line
    const ridgeLine = `${p(w / 2, 0, z + rh)} ${p(w / 2, d, z + rh)}`;

    if (roofType === "Walmdach") {
      // Hip roof: all 4 sides slope
      const frontHip = `${p(0, d, z)} ${p(w, d, z)} ${p(w * 0.7, d, z + rh)} ${p(w * 0.3, d, z + rh)}`;
      const rightHip = `${p(w, 0, z)} ${p(w, d, z)} ${p(w * 0.7, d, z + rh)} ${p(w * 0.7, 0, z + rh)}`;
      const topHip = `${p(w * 0.3, 0, z + rh)} ${p(w * 0.7, 0, z + rh)} ${p(w * 0.7, d, z + rh)} ${p(w * 0.3, d, z + rh)}`;

      roofPolygons.push(
        <g key="roof">
          <polygon points={frontHip} fill="#f59e0b" stroke="#92400e" strokeWidth={1} opacity={0.8} />
          <polygon points={rightHip} fill="#d97706" stroke="#92400e" strokeWidth={1} opacity={0.7} />
          <polygon points={topHip} fill="#fbbf24" stroke="#92400e" strokeWidth={1} opacity={0.5} />
        </g>
      );
    } else {
      // Satteldach / Pultdach
      roofPolygons.push(
        <g key="roof">
          <polygon points={frontRoof} fill="#f59e0b" stroke="#92400e" strokeWidth={1} opacity={0.8} />
          <polygon points={rightSlope} fill="#d97706" stroke="#92400e" strokeWidth={1} opacity={0.7} />
          <line
            x1={parseFloat(ridgeLine.split(" ")[0].split(",")[0])}
            y1={parseFloat(ridgeLine.split(" ")[0].split(",")[1])}
            x2={parseFloat(ridgeLine.split(" ")[1].split(",")[0])}
            y2={parseFloat(ridgeLine.split(" ")[1].split(",")[1])}
            stroke="#92400e"
            strokeWidth={1.5}
          />
        </g>
      );
    }
  }

  // Ground plane shadow
  const groundP = (x: number, y: number) => toSvgPoint(x, y, 0, ox, oy, s);
  const groundShadow = `${groundP(-0.5, -0.5)} ${groundP(w + 0.5, -0.5)} ${groundP(w + 0.5, d + 0.5)} ${groundP(-0.5, d + 0.5)}`;

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-4">3D-Ansicht (Isometrie)</h3>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full"
        style={{ maxHeight: "500px" }}
      >
        {/* Ground shadow */}
        <polygon points={groundShadow} fill="#e5e7eb" opacity={0.4} />

        {/* Floors */}
        {floorPolygons}

        {/* Roof */}
        {roofPolygons}

        {/* Dimensions */}
        <text
          x={parseFloat(toSvgPoint(w / 2, d + 1.5, 0, ox, oy, s).split(",")[0])}
          y={parseFloat(toSvgPoint(w / 2, d + 1.5, 0, ox, oy, s).split(",")[1])}
          fontSize={10}
          fill="#6b7280"
          textAnchor="middle"
        >
          {buildingWidth.toFixed(1)} m
        </text>
        <text
          x={parseFloat(toSvgPoint(w + 1.5, d / 2, 0, ox, oy, s).split(",")[0])}
          y={parseFloat(toSvgPoint(w + 1.5, d / 2, 0, ox, oy, s).split(",")[1])}
          fontSize={10}
          fill="#6b7280"
          textAnchor="middle"
        >
          {buildingDepth.toFixed(1)} m
        </text>
        <text
          x={parseFloat(toSvgPoint(-1, d + 0.5, totalH / 2, ox, oy, s).split(",")[0]) - 5}
          y={parseFloat(toSvgPoint(-1, d + 0.5, totalH / 2, ox, oy, s).split(",")[1])}
          fontSize={10}
          fill="#ef4444"
          textAnchor="end"
          fontWeight={600}
        >
          {totalH.toFixed(1)} m
        </text>
      </svg>
    </div>
  );
}
