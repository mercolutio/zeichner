import { NextRequest, NextResponse } from "next/server";
import { analyzeFloorplan, SupportedMediaType, FileInput } from "@/lib/claude";
import { z } from "zod";

const RoomSchema = z.object({
  name: z.string(),
  width: z.number(),
  length: z.number(),
  area: z.number(),
  category: z.enum([
    "wohnraum",
    "nutzraum",
    "balkon",
    "terrasse",
    "loggia",
    "keller",
    "garage",
  ]),
  x: z.number(),
  y: z.number(),
  hasSlope: z.boolean(),
  slopeDetails: z
    .object({
      minHeight: z.number(),
      maxHeight: z.number(),
      areaBelow1m: z.number(),
      areaBetween1and2m: z.number(),
      areaAbove2m: z.number(),
    })
    .nullable()
    .optional(),
});

const FloorSchema = z.object({
  name: z.string(),
  level: z.number(),
  ceilingHeight: z.number(),
  rooms: z.array(RoomSchema),
  floorArea: z.number(),
});

const CrossSectionRoomSchema = z.object({
  name: z.string(),
  xStart: z.number(),
  xEnd: z.number(),
  category: z.enum([
    "wohnraum", "nutzraum", "balkon", "terrasse", "loggia", "keller", "garage",
  ]),
  hasSlope: z.boolean(),
  slopeStartHeight: z.number().optional(),
  slopeEndHeight: z.number().optional(),
});

const CrossSectionFloorSchema = z.object({
  name: z.string(),
  level: z.number(),
  ceilingHeight: z.number(),
  rooms: z.array(CrossSectionRoomSchema),
});

const StairSchema = z.object({
  xStart: z.number(),
  xEnd: z.number(),
  fromLevel: z.number(),
  toLevel: z.number(),
});

const ExteriorElementSchema = z.object({
  type: z.enum(["balkon", "terrasse", "vordach", "erker"]),
  xStart: z.number(),
  xEnd: z.number(),
  level: z.number(),
  depth: z.number(),
});

const CrossSectionSchema = z.object({
  cutDirection: z.string(),
  floors: z.array(CrossSectionFloorSchema),
  stairs: z.array(StairSchema),
  exteriorElements: z.array(ExteriorElementSchema),
});

const AnalysisSchema = z.object({
  buildingType: z.string(),
  floors: z.array(FloorSchema),
  roofType: z.enum(["Satteldach", "Flachdach", "Walmdach", "Pultdach"]),
  roofPitchDegrees: z.number().nullable(),
  totalLivingArea: z.number(),
  totalUsableArea: z.number(),
  buildingWidth: z.number(),
  buildingDepth: z.number(),
  address: z.string().nullable().optional(),
  crossSection: CrossSectionSchema.optional(),
  cutLineDirection: z.enum(["horizontal", "vertical"]).optional().default("horizontal"),
  cutLinePosition: z.number().optional().default(0),
});

export const maxDuration = 300; // 5 Minuten Timeout für Opus

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const fileEntries = formData.getAll("files") as File[];

    // Backward compat: also accept single "file" field
    const singleFile = formData.get("file") as File | null;
    const allFiles = fileEntries.length > 0 ? fileEntries : singleFile ? [singleFile] : [];

    if (allFiles.length === 0) {
      return NextResponse.json(
        { error: "Keine Dateien hochgeladen" },
        { status: 400 }
      );
    }

    const supportedTypes: Record<string, SupportedMediaType> = {
      "image/png": "image/png",
      "image/jpeg": "image/jpeg",
      "image/webp": "image/webp",
      "application/pdf": "application/pdf",
    };

    const fileInputs: FileInput[] = [];
    for (const file of allFiles) {
      const mediaType = supportedTypes[file.type];
      if (!mediaType) {
        return NextResponse.json(
          { error: `Dateityp nicht unterstützt: ${file.name}` },
          { status: 400 }
        );
      }
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      fileInputs.push({ base64, mediaType, filename: file.name });
    }

    const result = await analyzeFloorplan(fileInputs, AnalysisSchema);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analyse-Fehler:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültiges Analyseergebnis", details: error.issues },
        { status: 422 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Fehler bei der Analyse: ${message}` },
      { status: 500 }
    );
  }
}
