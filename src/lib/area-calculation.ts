import { Room, Floor } from "@/types/floorplan";

/**
 * Berechnet die anrechenbare Wohnfläche eines Raums nach WoFlV.
 */
export function calculateRoomLivingArea(room: Room): number {
  switch (room.category) {
    case "balkon":
    case "terrasse":
      return room.area * 0.25;
    case "loggia":
      return room.area * 0.5;
    case "keller":
    case "garage":
      return 0;
    case "wohnraum":
    case "nutzraum":
      if (room.hasSlope && room.slopeDetails) {
        const { areaBelow1m, areaBetween1and2m, areaAbove2m } =
          room.slopeDetails;
        return areaBelow1m * 0 + areaBetween1and2m * 0.5 + areaAbove2m * 1.0;
      }
      return room.area;
    default:
      return room.area;
  }
}

/**
 * Berechnet die Gesamtwohnfläche eines Stockwerks nach WoFlV.
 */
export function calculateFloorLivingArea(floor: Floor): number {
  return floor.rooms.reduce(
    (sum, room) => sum + calculateRoomLivingArea(room),
    0
  );
}

/**
 * Gibt den Anrechnungsfaktor für die Kategorie zurück.
 */
export function getFactorLabel(room: Room): string {
  switch (room.category) {
    case "balkon":
    case "terrasse":
      return "25%";
    case "loggia":
      return "50%";
    case "keller":
    case "garage":
      return "0%";
    default:
      if (room.hasSlope) return "anteilig (Dachschräge)";
      return "100%";
  }
}
