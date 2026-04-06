import { BuildingData, FloorData, RoomData, roomArea, floorArea } from "@/types/building";
import { FloorplanAnalysis, Floor, Room } from "@/types/floorplan";
import { calculateRoomLivingArea } from "./area-calculation";

/** Convert the 3D building model to the FloorplanAnalysis format used by cross-sections, PDF export etc. */
export function buildingToAnalysis(building: BuildingData): FloorplanAnalysis {
  const floors: Floor[] = building.floors
    .sort((a, b) => a.level - b.level)
    .map((f) => ({
      name: f.name,
      level: f.level,
      ceilingHeight: f.ceilingHeight,
      rooms: f.rooms.map((r) => ({
        name: r.name,
        width: r.width,
        length: r.depth,
        area: roomArea(r),
        x: r.x,
        y: r.z,
        category: r.category,
        hasSlope: r.hasSlope,
        slopeDetails: r.slopeDetails ?? undefined,
      })),
      floorArea: floorArea(f),
    }));

  const totalUsableArea = floors.reduce((s, f) => s + f.floorArea, 0);
  const totalLivingArea = floors.reduce(
    (s, f) => s + f.rooms.reduce((rs, r) => rs + calculateRoomLivingArea(r), 0),
    0
  );

  // Auto-generate cross-section: cut through the middle of the building depth
  const cutPosition = building.depth / 2;
  const crossSection = {
    cutDirection: "Ost-West durch Gebäudemitte",
    floors: building.floors
      .sort((a, b) => a.level - b.level)
      .map((f) => {
        // Find rooms that the horizontal cut line intersects
        const intersecting = f.rooms
          .filter((r) => r.z <= cutPosition && r.z + r.depth >= cutPosition)
          .sort((a, b) => a.x - b.x);

        // If no rooms intersect, use all rooms
        const roomsToUse = intersecting.length > 0 ? intersecting : [...f.rooms].sort((a, b) => a.x - b.x);

        return {
          name: f.name,
          level: f.level,
          ceilingHeight: f.ceilingHeight,
          rooms: roomsToUse.map((r) => ({
            name: r.name,
            xStart: r.x,
            xEnd: r.x + r.width,
            category: r.category,
            hasSlope: r.hasSlope,
            slopeStartHeight: r.hasSlope ? r.slopeDetails?.minHeight : undefined,
            slopeEndHeight: r.hasSlope ? r.slopeDetails?.maxHeight : undefined,
          })),
        };
      }),
    stairs: [] as { xStart: number; xEnd: number; fromLevel: number; toLevel: number }[],
    exteriorElements: [] as { type: "balkon" | "terrasse" | "vordach" | "erker"; xStart: number; xEnd: number; level: number; depth: number }[],
  };

  return {
    buildingType: building.buildingType,
    floors,
    roofType: building.roofSegments.length > 0 ? building.roofSegments[0].type : building.roofType,
    roofPitchDegrees: building.roofSegments.length > 0 ? building.roofSegments[0].pitchDegrees : building.roofPitchDegrees,
    totalLivingArea,
    totalUsableArea,
    buildingWidth: building.width,
    buildingDepth: building.depth,
    address: building.address,
    crossSection,
    cutLineDirection: "horizontal",
    cutLinePosition: cutPosition,
  };
}
