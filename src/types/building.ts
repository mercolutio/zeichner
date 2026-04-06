export type RoomCategory =
  | "wohnraum"
  | "nutzraum"
  | "balkon"
  | "terrasse"
  | "loggia"
  | "wintergarten"
  | "keller"
  | "garage";

export type RoofType = "Satteldach" | "Flachdach" | "Walmdach" | "Pultdach";

export interface RoomData {
  id: string;
  name: string;
  width: number;   // Meter (X-Achse)
  depth: number;   // Meter (Z-Achse)
  x: number;       // Position vom linken Gebäuderand
  z: number;       // Position vom vorderen Gebäuderand
  category: RoomCategory;
  isVoid: boolean; // Negativraum — wird von der Fläche abgezogen
  hasSlope: boolean;
  slopeDetails?: {
    minHeight: number;
    maxHeight: number;
    areaBelow1m: number;
    areaBetween1and2m: number;
    areaAbove2m: number;
  };
}

export interface FloorData {
  id: string;
  name: string;
  level: number;         // -1 = KG, 0 = EG, 1 = OG, ...
  ceilingHeight: number; // Meter
  width: number;         // Stockwerk-Breite (X)
  depth: number;         // Stockwerk-Tiefe (Z)
  x: number;             // Offset vom Gebäude-Nullpunkt (X)
  z: number;             // Offset vom Gebäude-Nullpunkt (Z)
  rooms: RoomData[];
}

export interface RoofSegment {
  id: string;
  name: string;
  type: RoofType;
  pitchDegrees: number;
  rotation: number;   // Grad — Firstrichtung (0 = O-W, 90 = N-S, frei drehbar)
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface BuildingData {
  buildingType: string;
  floors: FloorData[];
  roofSegments: RoofSegment[];
  address?: string;
  // Legacy compat
  roofType: RoofType;
  roofPitchDegrees: number;
}

/** Total width across all floors (considering offsets) */
export function buildingWidth(b: BuildingData): number {
  return Math.max(1, ...b.floors.map((f) => (f.x || 0) + f.width));
}

/** Total depth across all floors (considering offsets) */
export function buildingDepth(b: BuildingData): number {
  return Math.max(1, ...b.floors.map((f) => (f.z || 0) + f.depth));
}

/** Min X offset across all floors */
export function buildingMinX(b: BuildingData): number {
  return Math.min(0, ...b.floors.map((f) => f.x || 0));
}

/** Min Z offset across all floors */
export function buildingMinZ(b: BuildingData): number {
  return Math.min(0, ...b.floors.map((f) => f.z || 0));
}

export function createRoom(partial?: Partial<RoomData>): RoomData {
  return {
    id: crypto.randomUUID(),
    name: "Raum",
    width: 4,
    depth: 3,
    x: 0,
    z: 0,
    category: "wohnraum",
    isVoid: false,
    hasSlope: false,
    ...partial,
  };
}

export function createFloor(partial?: Partial<FloorData>): FloorData {
  return {
    id: crypto.randomUUID(),
    name: "Erdgeschoss",
    level: 0,
    ceilingHeight: 2.5,
    width: 10,
    depth: 8,
    x: 0,
    z: 0,
    rooms: [],
    ...partial,
  };
}

export function createRoofSegment(partial?: Partial<RoofSegment>): RoofSegment {
  return {
    id: crypto.randomUUID(),
    name: "Hauptdach",
    type: "Satteldach",
    pitchDegrees: 35,
    rotation: 0,
    x: 0,
    z: 0,
    width: 10,
    depth: 8,
    ...partial,
  };
}

export function createBuilding(): BuildingData {
  return {
    buildingType: "Einfamilienhaus",
    floors: [
      createFloor({
        name: "Erdgeschoss",
        level: 0,
        width: 10,
        depth: 8,
        rooms: [
          createRoom({ name: "Wohnzimmer", width: 5, depth: 4, x: 0, z: 0 }),
          createRoom({ name: "Küche", width: 3.5, depth: 4, x: 5, z: 0, category: "nutzraum" }),
          createRoom({ name: "Flur", width: 1.5, depth: 4, x: 8.5, z: 0, category: "nutzraum" }),
          createRoom({ name: "Bad", width: 3, depth: 2.5, x: 0, z: 4, category: "nutzraum" }),
        ],
      }),
    ],
    roofSegments: [],
    roofType: "Satteldach",
    roofPitchDegrees: 35,
  };
}

/** Netto-Fläche: Räume minus Voids */
export function floorArea(floor: FloorData): number {
  return floor.rooms.reduce((sum, r) => {
    const area = r.width * r.depth;
    return sum + (r.isVoid ? -area : area);
  }, 0);
}

export function roomArea(room: RoomData): number {
  return room.width * room.depth;
}
