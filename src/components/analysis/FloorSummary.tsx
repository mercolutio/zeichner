"use client";

import { FloorplanAnalysis } from "@/types/floorplan";
import { Building2, Ruler, Home } from "lucide-react";

interface FloorSummaryProps {
  analysis: FloorplanAnalysis;
}

export default function FloorSummary({ analysis }: FloorSummaryProps) {
  const totalHeight = analysis.floors.reduce(
    (sum, f) => sum + f.ceilingHeight,
    0
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <Building2 className="w-5 h-5 text-blue-500 mb-2" />
        <p className="text-sm text-gray-500">Gebäudetyp</p>
        <p className="font-semibold text-gray-800">{analysis.buildingType}</p>
      </div>
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <Home className="w-5 h-5 text-blue-500 mb-2" />
        <p className="text-sm text-gray-500">Stockwerke</p>
        <p className="font-semibold text-gray-800">{analysis.floors.length}</p>
      </div>
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <Ruler className="w-5 h-5 text-blue-500 mb-2" />
        <p className="text-sm text-gray-500">Gebäudemaße</p>
        <p className="font-semibold text-gray-800">
          {analysis.buildingWidth.toFixed(1)} x{" "}
          {analysis.buildingDepth.toFixed(1)} m
        </p>
      </div>
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <Ruler className="w-5 h-5 text-blue-500 mb-2" />
        <p className="text-sm text-gray-500">Dach</p>
        <p className="font-semibold text-gray-800">
          {analysis.roofType}
          {analysis.roofPitchDegrees && ` (${analysis.roofPitchDegrees}°)`}
        </p>
      </div>
    </div>
  );
}
