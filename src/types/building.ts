export type RoomCategory =
  | "wohnraum"
  | "nutzraum"
  | "balkon"
  | "terrasse"
  | "loggia"
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
  rooms: RoomData[];
}

export type RidgeDirection = "east-west" | "north-south";

export interface RoofSegment {
  id: string;
  name: string;
  type: RoofType;
  pitchDegrees: number;
  ridgeDirection: RidgeDirection; // Firstrichtung
  x: number;        // Position vom linken Gebäuderand
  z: number;        // Position vom vorderen Gebäuderand
  width: number;    // Breite (X)
  depth: number;    // Tiefe (Z)
}

export interface BuildingData {
  buildingType: string;
  width: number;       // Gebäudebreite (X)
  depth: number;       // Gebäudetiefe (Z)
  floors: FloorData[];
  roofSegments: RoofSegment[];
  address?: string;
  // Legacy — wird ignoriert wenn roofSegments.length > 0
  roofType: RoofType;
  roofPitchDegrees: number;
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
    ridgeDirection: "east-west",
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
    width: 10,
    depth: 8,
    floors: [
      createFloor({
        name: "Erdgeschoss",
        level: 0,
        rooms: [
          createRoom({ name: "Wohnzimmer", width: 5, depth: 4, x: 0, z: 0 }),
          createRoom({ name: "Küche", width: 3.5, depth: 4, x: 5, z: 0, category: "nutzraum" }),
          createRoom({ name: "Flur", width: 1.5, depth: 4, x: 8.5, z: 0, category: "nutzraum" }),
          createRoom({ name: "Bad", width: 3, depth: 2.5, x: 0, z: 4, category: "nutzraum" }),
        ],
      }),
    ],
    roofSegments: [
      createRoofSegment({ name: "Hauptdach", width: 10, depth: 8 }),
    ],
    roofType: "Satteldach",
    roofPitchDegrees: 35,
  };
}

export function floorArea(floor: FloorData): number {
  return floor.rooms.reduce((sum, r) => sum + r.width * r.depth, 0);
}

export function roomArea(room: RoomData): number {
  return room.width * room.depth;
}
