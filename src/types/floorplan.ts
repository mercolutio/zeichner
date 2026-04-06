export type RoomCategory =
  | "wohnraum"
  | "nutzraum"
  | "balkon"
  | "terrasse"
  | "loggia"
  | "keller"
  | "garage";

export type RoofType = "Satteldach" | "Flachdach" | "Walmdach" | "Pultdach";

export interface SlopeDetails {
  minHeight: number;
  maxHeight: number;
  areaBelow1m: number;
  areaBetween1and2m: number;
  areaAbove2m: number;
}

export interface Room {
  name: string;
  width: number;
  length: number;
  area: number;
  x: number;       // Position linke obere Ecke, Meter vom linken Gebäuderand
  y: number;       // Position linke obere Ecke, Meter vom oberen Gebäuderand
  category: RoomCategory;
  hasSlope: boolean;
  slopeDetails?: SlopeDetails;
}

export interface Floor {
  name: string;
  level: number;
  ceilingHeight: number;
  rooms: Room[];
  floorArea: number;
}

// ── Cross-Section Layout (von Claude generiert) ──

export interface CrossSectionRoom {
  name: string;
  xStart: number;          // Meter vom linken Gebäuderand
  xEnd: number;            // Meter vom linken Gebäuderand
  category: RoomCategory;
  hasSlope: boolean;
  slopeStartHeight?: number;  // Raumhöhe am linken Rand (bei Dachschräge)
  slopeEndHeight?: number;    // Raumhöhe am rechten Rand
}

export interface CrossSectionFloor {
  name: string;
  level: number;
  ceilingHeight: number;
  rooms: CrossSectionRoom[];
}

export interface StairPosition {
  xStart: number;
  xEnd: number;
  fromLevel: number;
  toLevel: number;
}

export interface ExteriorElement {
  type: "balkon" | "terrasse" | "vordach" | "erker";
  xStart: number;
  xEnd: number;
  level: number;
  depth: number;
}

export interface CrossSectionLayout {
  cutDirection: string;
  floors: CrossSectionFloor[];
  stairs: StairPosition[];
  exteriorElements: ExteriorElement[];
}

// ── Hauptanalyse ──

export interface FloorplanAnalysis {
  buildingType: string;
  floors: Floor[];
  roofType: RoofType;
  roofPitchDegrees: number | null;
  totalLivingArea: number;
  totalUsableArea: number;
  buildingWidth: number;
  buildingDepth: number;
  address?: string;
  crossSection?: CrossSectionLayout;
  cutLineDirection: "horizontal" | "vertical";
  cutLinePosition: number; // Meter — Position der Schnittlinie
}

export type AppStep = "upload" | "loading" | "edit" | "result";
