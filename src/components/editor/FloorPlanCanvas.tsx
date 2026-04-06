"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Floor, Room, RoomCategory } from "@/types/floorplan";

interface FloorPlanCanvasProps {
  floor: Floor;
  buildingWidth: number;
  buildingDepth: number;
  cutLinePosition: number;
  cutLineDirection: "horizontal" | "vertical";
  onFloorChange: (floor: Floor) => void;
  onCutLineMove: (position: number) => void;
}

const SNAP = 0.05; // Snap to 5cm grid
const CATEGORY_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  wohnraum: { fill: "#dbeafe", stroke: "#3b82f6", label: "Wohnraum" },
  nutzraum: { fill: "#e5e7eb", stroke: "#6b7280", label: "Nutzraum" },
  keller: { fill: "#f5f0eb", stroke: "#a3896b", label: "Keller" },
  balkon: { fill: "#d1fae5", stroke: "#10b981", label: "Balkon" },
  terrasse: { fill: "#d1fae5", stroke: "#10b981", label: "Terrasse" },
  loggia: { fill: "#d1fae5", stroke: "#10b981", label: "Loggia" },
  garage: { fill: "#f3f4f6", stroke: "#9ca3af", label: "Garage" },
};

const CATEGORIES: RoomCategory[] = ["wohnraum", "nutzraum", "keller", "balkon", "terrasse", "loggia", "garage"];

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

function roomIntersects(room: Room, cutPos: number, dir: "horizontal" | "vertical"): boolean {
  if (dir === "horizontal") return room.y <= cutPos && room.y + room.length >= cutPos;
  return room.x <= cutPos && room.x + room.width >= cutPos;
}

// Snap room to nearest neighbor edges (lego-style clipping)
function snapToNeighbors(room: Room, index: number, allRooms: Room[], bw: number, bd: number): { x: number; y: number } {
  let { x, y } = room;
  const threshold = 0.3; // Snap within 30cm

  // Snap to building edges
  if (x < threshold) x = 0;
  if (y < threshold) y = 0;
  if (Math.abs(x + room.width - bw) < threshold) x = bw - room.width;
  if (Math.abs(y + room.length - bd) < threshold) y = bd - room.length;

  // Snap to other rooms
  for (let i = 0; i < allRooms.length; i++) {
    if (i === index) continue;
    const other = allRooms[i];

    // Right edge of this → left edge of other
    if (Math.abs(x + room.width - other.x) < threshold) x = other.x - room.width;
    // Left edge of this → right edge of other
    if (Math.abs(x - (other.x + other.width)) < threshold) x = other.x + other.width;
    // Bottom edge of this → top edge of other
    if (Math.abs(y + room.length - other.y) < threshold) y = other.y - room.length;
    // Top edge of this → bottom edge of other
    if (Math.abs(y - (other.y + other.length)) < threshold) y = other.y + other.length;

    // Align tops
    if (Math.abs(y - other.y) < threshold) y = other.y;
    // Align lefts
    if (Math.abs(x - other.x) < threshold) x = other.x;
    // Align bottoms
    if (Math.abs(y + room.length - (other.y + other.length)) < threshold) y = other.y + other.length - room.length;
    // Align rights
    if (Math.abs(x + room.width - (other.x + other.width)) < threshold) x = other.x + other.width - room.width;
  }

  return { x: snap(Math.max(0, x)), y: snap(Math.max(0, y)) };
}

interface EditingState {
  roomIndex: number;
  field: "name" | "width" | "length" | "category";
}

export default function FloorPlanCanvas({
  floor,
  buildingWidth,
  buildingDepth,
  cutLinePosition,
  cutLineDirection,
  onFloorChange,
  onCutLineMove,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{
    type: "room" | "cutline" | "resize";
    roomIndex?: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW?: number;
    origL?: number;
    handle?: "right" | "bottom" | "corner";
  } | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const padding = 50;
  const svgWidth = 750;
  const maxScale = (svgWidth - padding * 2) / Math.max(buildingWidth, 1);
  const scale = Math.min(maxScale, (500 - padding * 2) / Math.max(buildingDepth, 1));
  const svgHeight = buildingDepth * scale + padding * 2;

  const toSvgX = (m: number) => padding + m * scale;
  const toSvgY = (m: number) => padding + m * scale;

  const getSvgPoint = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (svgWidth / rect.width),
        y: (e.clientY - rect.top) * (svgHeight / rect.height),
      };
    },
    [svgWidth, svgHeight]
  );

  const updateRoom = useCallback((index: number, partial: Partial<Room>) => {
    const rooms = [...floor.rooms];
    const updated = { ...rooms[index], ...partial };
    if ("width" in partial || "length" in partial) {
      updated.area = Math.round(updated.width * updated.length * 100) / 100;
    }
    rooms[index] = updated;
    const floorArea = rooms.reduce((s, r) => s + r.area, 0);
    onFloorChange({ ...floor, rooms, floorArea });
  }, [floor, onFloorChange]);

  const removeRoom = useCallback((index: number) => {
    const rooms = floor.rooms.filter((_, i) => i !== index);
    const floorArea = rooms.reduce((s, r) => s + r.area, 0);
    onFloorChange({ ...floor, rooms, floorArea });
    setSelectedRoom(null);
  }, [floor, onFloorChange]);

  const addRoom = useCallback(() => {
    const newRoom: Room = {
      name: "Neuer Raum",
      width: 3.0,
      length: 3.0,
      area: 9.0,
      x: 0,
      y: 0,
      category: "wohnraum",
      hasSlope: false,
    };
    const rooms = [...floor.rooms, newRoom];
    const floorArea = rooms.reduce((s, r) => s + r.area, 0);
    onFloorChange({ ...floor, rooms, floorArea });
    setSelectedRoom(rooms.length - 1);
  }, [floor, onFloorChange]);

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: "room" | "cutline" | "resize", roomIndex?: number, handle?: "right" | "bottom" | "corner") => {
      e.preventDefault();
      e.stopPropagation();
      const pt = getSvgPoint(e);
      const room = roomIndex !== undefined ? floor.rooms[roomIndex] : null;
      setDragging({
        type,
        roomIndex,
        startX: pt.x,
        startY: pt.y,
        origX: type === "cutline" ? cutLinePosition : (room?.x ?? 0),
        origY: type === "cutline" ? cutLinePosition : (room?.y ?? 0),
        origW: room?.width,
        origL: room?.length,
        handle,
      });
      if (type === "room") setSelectedRoom(roomIndex ?? null);
    },
    [getSvgPoint, floor.rooms, cutLinePosition]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const pt = getSvgPoint(e);
      const dx = (pt.x - dragging.startX) / scale;
      const dy = (pt.y - dragging.startY) / scale;

      if (dragging.type === "room" && dragging.roomIndex !== undefined) {
        const room = floor.rooms[dragging.roomIndex];
        const newX = dragging.origX + dx;
        const newY = dragging.origY + dy;
        const snapped = snapToNeighbors(
          { ...room, x: newX, y: newY },
          dragging.roomIndex,
          floor.rooms,
          buildingWidth,
          buildingDepth
        );
        updateRoom(dragging.roomIndex, { x: snapped.x, y: snapped.y });
      } else if (dragging.type === "resize" && dragging.roomIndex !== undefined) {
        const h = dragging.handle;
        if (h === "right" || h === "corner") {
          const newW = snap(Math.max(0.5, (dragging.origW ?? 1) + dx));
          updateRoom(dragging.roomIndex, { width: newW });
        }
        if (h === "bottom" || h === "corner") {
          const newL = snap(Math.max(0.5, (dragging.origL ?? 1) + dy));
          updateRoom(dragging.roomIndex, { length: newL });
        }
      } else if (dragging.type === "cutline") {
        const maxVal = cutLineDirection === "horizontal" ? buildingDepth : buildingWidth;
        const delta = cutLineDirection === "horizontal" ? dy : dx;
        onCutLineMove(snap(Math.max(0, Math.min(maxVal, dragging.origX + delta))));
      }
    };

    const handleMouseUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, getSvgPoint, scale, floor.rooms, buildingWidth, buildingDepth, cutLineDirection, updateRoom, onCutLineMove]);

  // Handle click on background to deselect
  const handleBgClick = () => {
    if (!dragging) {
      setSelectedRoom(null);
      setEditing(null);
    }
  };

  const handleSize = 7;

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full border rounded-lg bg-white select-none"
        style={{ maxHeight: "500px", cursor: dragging ? "grabbing" : "default" }}
        onClick={handleBgClick}
      >
        {/* Grid 1m */}
        {Array.from({ length: Math.ceil(buildingWidth) + 1 }).map((_, i) => (
          <line key={`gx-${i}`} x1={toSvgX(i)} y1={toSvgY(0)} x2={toSvgX(i)} y2={toSvgY(buildingDepth)} stroke={i % 5 === 0 ? "#e5e7eb" : "#f3f4f6"} strokeWidth={i % 5 === 0 ? 0.8 : 0.3} />
        ))}
        {Array.from({ length: Math.ceil(buildingDepth) + 1 }).map((_, i) => (
          <line key={`gy-${i}`} x1={toSvgX(0)} y1={toSvgY(i)} x2={toSvgX(buildingWidth)} y2={toSvgY(i)} stroke={i % 5 === 0 ? "#e5e7eb" : "#f3f4f6"} strokeWidth={i % 5 === 0 ? 0.8 : 0.3} />
        ))}

        {/* Building outline */}
        <rect x={toSvgX(0)} y={toSvgY(0)} width={buildingWidth * scale} height={buildingDepth * scale} fill="none" stroke="#374151" strokeWidth={2.5} />

        {/* Rooms */}
        {floor.rooms.map((room, i) => {
          const colors = CATEGORY_COLORS[room.category] || CATEGORY_COLORS.wohnraum;
          const intersects = roomIntersects(room, cutLinePosition, cutLineDirection);
          const isSelected = selectedRoom === i;
          const rx = toSvgX(room.x);
          const ry = toSvgY(room.y);
          const rw = room.width * scale;
          const rh = room.length * scale;
          const fontSize = Math.min(rw * 0.12, rh * 0.15, 13);

          return (
            <g key={i} onClick={(e) => { e.stopPropagation(); setSelectedRoom(i); setEditing(null); }}>
              {/* Room body */}
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                fill={intersects ? "#fef3c7" : colors.fill}
                stroke={isSelected ? "#1d4ed8" : intersects ? "#f59e0b" : colors.stroke}
                strokeWidth={isSelected ? 2.5 : 1.2}
                rx={1}
                onMouseDown={(e) => handleMouseDown(e, "room", i)}
                style={{ cursor: dragging?.roomIndex === i ? "grabbing" : "grab" }}
              />

              {/* Wall lines (thick borders like lego) */}
              <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke={colors.stroke} strokeWidth={2} rx={1} opacity={0.4} />

              {/* Room name — click to edit */}
              <text
                x={rx + rw / 2}
                y={ry + rh / 2 - fontSize * 0.3}
                textAnchor="middle"
                fontSize={fontSize}
                fill="#1e293b"
                fontWeight={600}
                fontFamily="system-ui, sans-serif"
                style={{ cursor: "text", pointerEvents: "all" }}
                onDoubleClick={(e) => { e.stopPropagation(); setEditing({ roomIndex: i, field: "name" }); }}
              >
                {room.name}
              </text>

              {/* Dimensions */}
              <text
                x={rx + rw / 2}
                y={ry + rh / 2 + fontSize * 0.7}
                textAnchor="middle"
                fontSize={fontSize * 0.7}
                fill="#6b7280"
                fontFamily="system-ui, sans-serif"
                style={{ cursor: "text", pointerEvents: "all" }}
                onDoubleClick={(e) => { e.stopPropagation(); setEditing({ roomIndex: i, field: "width" }); }}
              >
                {room.width.toFixed(2)} × {room.length.toFixed(2)} m
              </text>

              {/* Area */}
              <text
                x={rx + rw / 2}
                y={ry + rh / 2 + fontSize * 1.5}
                textAnchor="middle"
                fontSize={fontSize * 0.65}
                fill="#9ca3af"
                fontFamily="system-ui, sans-serif"
              >
                {room.area.toFixed(1)} m²
              </text>

              {/* Resize handles (when selected) */}
              {isSelected && (
                <>
                  {/* Right edge */}
                  <rect x={rx + rw - handleSize / 2} y={ry + rh / 2 - handleSize / 2} width={handleSize} height={handleSize} fill="#3b82f6" rx={1} style={{ cursor: "ew-resize" }} onMouseDown={(e) => handleMouseDown(e, "resize", i, "right")} />
                  {/* Bottom edge */}
                  <rect x={rx + rw / 2 - handleSize / 2} y={ry + rh - handleSize / 2} width={handleSize} height={handleSize} fill="#3b82f6" rx={1} style={{ cursor: "ns-resize" }} onMouseDown={(e) => handleMouseDown(e, "resize", i, "bottom")} />
                  {/* Corner */}
                  <rect x={rx + rw - handleSize / 2} y={ry + rh - handleSize / 2} width={handleSize} height={handleSize} fill="#1d4ed8" rx={1} style={{ cursor: "nwse-resize" }} onMouseDown={(e) => handleMouseDown(e, "resize", i, "corner")} />
                </>
              )}
            </g>
          );
        })}

        {/* Cut line */}
        {cutLineDirection === "horizontal" ? (
          <g>
            <line x1={toSvgX(-0.3)} y1={toSvgY(cutLinePosition)} x2={toSvgX(buildingWidth + 0.3)} y2={toSvgY(cutLinePosition)} stroke="#ef4444" strokeWidth={2} strokeDasharray="8,4" />
            <rect x={toSvgX(-0.3) - 5} y={toSvgY(cutLinePosition) - 8} width={10} height={16} fill="#ef4444" rx={3} style={{ cursor: "ns-resize" }} onMouseDown={(e) => handleMouseDown(e, "cutline")} />
            <rect x={toSvgX(buildingWidth + 0.3) - 5} y={toSvgY(cutLinePosition) - 8} width={10} height={16} fill="#ef4444" rx={3} style={{ cursor: "ns-resize" }} onMouseDown={(e) => handleMouseDown(e, "cutline")} />
            <text x={toSvgX(buildingWidth + 0.6)} y={toSvgY(cutLinePosition) + 4} fontSize={10} fill="#ef4444" fontWeight={600}>Schnitt ({cutLinePosition.toFixed(2)} m)</text>
          </g>
        ) : (
          <g>
            <line x1={toSvgX(cutLinePosition)} y1={toSvgY(-0.3)} x2={toSvgX(cutLinePosition)} y2={toSvgY(buildingDepth + 0.3)} stroke="#ef4444" strokeWidth={2} strokeDasharray="8,4" />
            <rect x={toSvgX(cutLinePosition) - 8} y={toSvgY(-0.3) - 5} width={16} height={10} fill="#ef4444" rx={3} style={{ cursor: "ew-resize" }} onMouseDown={(e) => handleMouseDown(e, "cutline")} />
            <text x={toSvgX(cutLinePosition)} y={toSvgY(-0.6)} textAnchor="middle" fontSize={10} fill="#ef4444" fontWeight={600}>Schnitt ({cutLinePosition.toFixed(2)} m)</text>
          </g>
        )}

        {/* Dimensions */}
        <text x={toSvgX(buildingWidth / 2)} y={padding - 15} textAnchor="middle" fontSize={11} fill="#374151" fontWeight={500}>{buildingWidth.toFixed(2)} m</text>
        <text x={padding - 20} y={toSvgY(buildingDepth / 2)} textAnchor="middle" fontSize={11} fill="#374151" fontWeight={500} transform={`rotate(-90, ${padding - 20}, ${toSvgY(buildingDepth / 2)})`}>{buildingDepth.toFixed(2)} m</text>
      </svg>

      {/* Inline editor panel (below SVG, for selected room) */}
      {selectedRoom !== null && selectedRoom < floor.rooms.length && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg border flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <label className="text-gray-500 text-xs">Name:</label>
            <input
              type="text"
              value={floor.rooms[selectedRoom].name}
              onChange={(e) => updateRoom(selectedRoom, { name: e.target.value })}
              className="px-2 py-1 border rounded text-sm w-32 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-gray-500 text-xs">Breite:</label>
            <input
              type="number"
              value={floor.rooms[selectedRoom].width}
              onChange={(e) => updateRoom(selectedRoom, { width: parseFloat(e.target.value) || 0 })}
              step={0.01}
              className="px-2 py-1 border rounded text-sm w-20 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-xs text-gray-400">m</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-gray-500 text-xs">Länge:</label>
            <input
              type="number"
              value={floor.rooms[selectedRoom].length}
              onChange={(e) => updateRoom(selectedRoom, { length: parseFloat(e.target.value) || 0 })}
              step={0.01}
              className="px-2 py-1 border rounded text-sm w-20 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-xs text-gray-400">m</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-gray-500 text-xs">x:</label>
            <input
              type="number"
              value={floor.rooms[selectedRoom].x}
              onChange={(e) => updateRoom(selectedRoom, { x: parseFloat(e.target.value) || 0 })}
              step={0.05}
              className="px-2 py-1 border rounded text-sm w-16 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-gray-500 text-xs">y:</label>
            <input
              type="number"
              value={floor.rooms[selectedRoom].y}
              onChange={(e) => updateRoom(selectedRoom, { y: parseFloat(e.target.value) || 0 })}
              step={0.05}
              className="px-2 py-1 border rounded text-sm w-16 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-gray-500 text-xs">Typ:</label>
            <select
              value={floor.rooms[selectedRoom].category}
              onChange={(e) => updateRoom(selectedRoom, { category: e.target.value as RoomCategory })}
              className="px-2 py-1 border rounded text-sm bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_COLORS[c]?.label || c}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-400 ml-1">
            {floor.rooms[selectedRoom].area.toFixed(2)} m²
          </div>
          <button
            onClick={() => removeRoom(selectedRoom)}
            className="ml-auto px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200"
          >
            Löschen
          </button>
        </div>
      )}

      {/* Add room button */}
      <div className="mt-2 flex justify-end">
        <button
          onClick={addRoom}
          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
        >
          + Raum hinzufügen
        </button>
      </div>
    </div>
  );
}
