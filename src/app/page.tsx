"use client";

import { useState } from "react";
import { FloorplanAnalysis, AppStep } from "@/types/floorplan";
import FloorplanUploader from "@/components/upload/FloorplanUploader";
import RoomTable from "@/components/analysis/RoomTable";
import AreaCalculation from "@/components/analysis/AreaCalculation";
import FloorSummary from "@/components/analysis/FloorSummary";
import CrossSection from "@/components/drawing/CrossSection";
import IsometricView from "@/components/drawing/IsometricView";
import PdfExportButton from "@/components/pdf/PdfExportButton";
import AnalysisEditor from "@/components/editor/AnalysisEditor";
import { ArrowLeft, FileText } from "lucide-react";

export default function Home() {
  const [step, setStep] = useState<AppStep>("upload");
  const [analysis, setAnalysis] = useState<FloorplanAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floorplanImages, setFloorplanImages] = useState<string[]>([]);

  const handleAnalyze = async (files: File[]) => {
    setStep("loading");
    setError(null);

    try {
      // Bilder als DataURLs speichern für PDF
      const imagePromises = files
        .filter((f) => f.type !== "application/pdf")
        .map(
          (f) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(f);
            })
        );
      const images = await Promise.all(imagePromises);
      setFloorplanImages(images);

      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch("/api/analyze-floorplan", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Analyse fehlgeschlagen");
      }

      const result: FloorplanAnalysis = await response.json();
      setAnalysis(result);
      setStep("edit");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ein unbekannter Fehler ist aufgetreten"
      );
      setStep("upload");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setAnalysis(null);
    setError(null);
    setFloorplanImages([]);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Zeichner</h1>
            <span className="text-sm text-gray-400 hidden sm:inline">
              KI-Grundrissanalyse
            </span>
          </div>
          {(step === "result" || step === "edit") && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Neuer Grundriss
            </button>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Upload-Schritt */}
        {step === "upload" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">
                Grundriss analysieren
              </h2>
              <p className="text-gray-600">
                Laden Sie einen Grundriss hoch und erhalten Sie automatisch
                Gebäudeschnitte und Wohnflächenberechnungen für die Bank.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <FloorplanUploader onAnalyze={handleAnalyze} isLoading={false} />

            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm text-gray-500">
              <div className="p-4 bg-white rounded-xl border">
                <p className="font-medium text-gray-700 mb-1">1. Hochladen</p>
                <p>Grundriss als PNG, JPG, WebP oder PDF</p>
              </div>
              <div className="p-4 bg-white rounded-xl border">
                <p className="font-medium text-gray-700 mb-1">2. KI-Analyse</p>
                <p>Räume, Maße und Struktur erkennen</p>
              </div>
              <div className="p-4 bg-white rounded-xl border">
                <p className="font-medium text-gray-700 mb-1">3. Korrigieren</p>
                <p>Höhen & Maße prüfen und anpassen</p>
              </div>
              <div className="p-4 bg-white rounded-xl border">
                <p className="font-medium text-gray-700 mb-1">4. PDF-Export</p>
                <p>Schnitt & Flächen als PDF</p>
              </div>
            </div>
          </div>
        )}

        {/* Lade-Schritt */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />
            <p className="text-lg font-medium text-gray-700">
              Grundriss wird analysiert...
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Die KI erkennt Räume, Maße und Gebäudestruktur
            </p>
          </div>
        )}

        {/* Bearbeitungs-Schritt */}
        {step === "edit" && analysis && (
          <AnalysisEditor
            initial={analysis}
            onConfirm={(edited) => {
              setAnalysis(edited);
              setStep("result");
            }}
          />
        )}

        {/* Ergebnis-Schritt */}
        {step === "result" && analysis && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  Analyseergebnis
                </h2>
                <button
                  onClick={() => setStep("edit")}
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Daten bearbeiten
                </button>
              </div>
              <PdfExportButton analysis={analysis} floorplanImages={floorplanImages} />
            </div>

            <FloorSummary analysis={analysis} />

            {/* Grundriss-Bilder */}
            {floorplanImages.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-4">
                  Hochgeladene Grundrisse ({floorplanImages.length})
                </h3>
                <div className={`grid gap-4 ${floorplanImages.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                  {floorplanImages.map((img, i) => (
                    <div key={i} className="relative rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center">
                      <img src={img} alt={`Grundriss ${i + 1}`} className="max-w-full max-h-[400px] object-contain" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Isometrische Ansicht */}
            <IsometricView analysis={analysis} />

            {/* Schnitt */}
            <CrossSection analysis={analysis} />

            <AreaCalculation analysis={analysis} />

            <RoomTable floors={analysis.floors} />
          </div>
        )}
      </div>
    </main>
  );
}
