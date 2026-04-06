"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { FloorplanAnalysis } from "@/types/floorplan";
import PdfFloorplanDocument from "./PdfDocument";

interface PdfExportButtonProps {
  analysis: FloorplanAnalysis;
  floorplanImages?: string[];
}

export default function PdfExportButton({ analysis, floorplanImages }: PdfExportButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleExport = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <PdfFloorplanDocument analysis={analysis} floorplanImages={floorplanImages} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.download = `Grundrissanalyse-${date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF-Generierung fehlgeschlagen:", error);
      alert("PDF konnte nicht generiert werden. Bitte versuchen Sie es erneut.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={generating}
      className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      {generating ? (
        <>
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          PDF wird erstellt...
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          PDF herunterladen
        </>
      )}
    </button>
  );
}
