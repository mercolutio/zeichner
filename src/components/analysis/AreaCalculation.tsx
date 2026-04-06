"use client";

import { FloorplanAnalysis } from "@/types/floorplan";
import { calculateFloorLivingArea } from "@/lib/area-calculation";

interface AreaCalculationProps {
  analysis: FloorplanAnalysis;
}

export default function AreaCalculation({ analysis }: AreaCalculationProps) {
  const totalWohnflaeche = analysis.floors.reduce(
    (sum, floor) => sum + calculateFloorLivingArea(floor),
    0
  );

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-4">
        Wohnflächenberechnung nach WoFlV
      </h3>

      <div className="space-y-3">
        {analysis.floors.map((floor) => {
          const livingArea = calculateFloorLivingArea(floor);
          return (
            <div
              key={floor.level}
              className="flex justify-between items-center py-2 border-b"
            >
              <span className="text-gray-700">{floor.name}</span>
              <div className="text-right">
                <span className="text-gray-800 font-medium">
                  {livingArea.toFixed(2)} m²
                </span>
                {livingArea !== floor.floorArea && (
                  <span className="text-gray-400 text-sm ml-2">
                    (von {floor.floorArea.toFixed(2)} m²)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t-2 border-blue-100">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-800">
            Gesamtwohnfläche
          </span>
          <span className="text-2xl font-bold text-blue-600">
            {totalWohnflaeche.toFixed(2)} m²
          </span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-sm text-gray-500">Gesamtnutzfläche</span>
          <span className="text-sm text-gray-500">
            {analysis.totalUsableArea.toFixed(2)} m²
          </span>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
        Berechnung nach Wohnflächenverordnung (WoFlV): Balkone/Terrassen 25%,
        Loggien 50%, Dachschräge unter 1m 0%, 1–2m 50%, über 2m 100%.
        Keller und Garagen werden nicht angerechnet.
      </div>
    </div>
  );
}
