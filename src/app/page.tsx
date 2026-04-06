"use client";

import { useState, useEffect, useCallback } from "react";
import { BuildingData, createBuilding } from "@/types/building";
import { buildingToAnalysis } from "@/lib/building-to-analysis";
import dynamic from "next/dynamic";
import CrossSection from "@/components/drawing/CrossSection";
import IsometricView from "@/components/drawing/IsometricView";
import AreaCalculation from "@/components/analysis/AreaCalculation";
import FloorSummary from "@/components/analysis/FloorSummary";
import RoomTable from "@/components/analysis/RoomTable";
import PdfExportButton from "@/components/pdf/PdfExportButton";
import { FileText, Box, Scissors, FileDown } from "lucide-react";

const BuildingEditor3D = dynamic(
  () => import("@/components/builder/BuildingEditor3D"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-gray-400">
        3D-Editor wird geladen...
      </div>
    ),
  }
);

type Tab = "editor" | "sections" | "result";

const STORAGE_KEY = "zeichner-building";

function loadBuilding(): BuildingData {
  if (typeof window === "undefined") return createBuilding();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      // Validate essential structure
      if (
        !data ||
        !Array.isArray(data.floors) ||
        data.floors.length === 0 ||
        typeof data.floors[0].width !== "number" ||
        !Array.isArray(data.roofSegments)
      ) {
        // Old/invalid schema — discard
        localStorage.removeItem(STORAGE_KEY);
        return createBuilding();
      }
      // Migrate missing fields
      for (const floor of data.floors) {
        if (typeof floor.x !== "number") floor.x = 0;
        if (typeof floor.z !== "number") floor.z = 0;
        for (const room of floor.rooms) {
          if (typeof room.isVoid !== "boolean") room.isVoid = false;
        }
      }
      return data as BuildingData;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createBuilding();
}

export default function Home() {
  const [building, setBuilding] = useState<BuildingData>(loadBuilding);
  const [activeTab, setActiveTab] = useState<Tab>("editor");

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(building));
    } catch { /* quota exceeded etc */ }
  }, [building]);

  const analysis = buildingToAnalysis(building);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "editor", label: "3D-Editor", icon: <Box className="w-4 h-4" /> },
    { id: "sections", label: "Schnitte", icon: <Scissors className="w-4 h-4" /> },
    { id: "result", label: "Ergebnis & PDF", icon: <FileDown className="w-4 h-4" /> },
  ];

  return (
    <main className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900">Zeichner</h1>
            <span className="text-sm text-gray-400 hidden sm:inline">
              Gebäude-Modellierer
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="w-32" />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "editor" && (
          <BuildingEditor3D building={building} onChange={setBuilding} />
        )}

        {activeTab === "sections" && (
          <div className="h-full overflow-y-auto p-6 space-y-6 bg-gray-50">
            <div className="max-w-5xl mx-auto space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">Schnittzeichnungen</h2>
              <CrossSection analysis={analysis} />
              <IsometricView analysis={analysis} />
            </div>
          </div>
        )}

        {activeTab === "result" && (
          <div className="h-full overflow-y-auto p-6 space-y-6 bg-gray-50">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Ergebnis</h2>
                <PdfExportButton analysis={analysis} floorplanImages={[]} />
              </div>
              <FloorSummary analysis={analysis} />
              <AreaCalculation analysis={analysis} />
              <RoomTable floors={analysis.floors} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
