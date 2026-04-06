"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { Canvas, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text, Html, Grid, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  BuildingData,
  FloorData,
  RoomData,
  RoofType,
  RoomCategory,
  createRoom,
  createFloor,
  roomArea,
} from "@/types/building";

interface BuildingEditor3DProps {
  building: BuildingData;
  onChange: (building: BuildingData) => void;
}

const CATEGORY_COLORS: Record<RoomCategory, string> = {
  wohnraum: "#93c5fd",
  nutzraum: "#d1d5db",
  balkon: "#86efac",
  terrasse: "#86efac",
  loggia: "#a5b4fc",
  keller: "#d4b896",
  garage: "#e5e7eb",
};

const CATEGORY_LABELS: Record<RoomCategory, string> = {
  wohnraum: "Wohnraum",
  nutzraum: "Nutzraum",
  balkon: "Balkon",
  terrasse: "Terrasse",
  loggia: "Loggia",
  keller: "Keller",
  garage: "Garage",
};

const SNAP = 0.05;

function snapValue(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

// Snap to building edges and other room edges
function snapWithGuides(
  x: number,
  z: number,
  w: number,
  d: number,
  buildingW: number,
  buildingD: number,
  otherRooms: RoomData[],
  threshold = 0.2
): { x: number; z: number; guidesX: number[]; guidesZ: number[] } {
  let sx = snapValue(x);
  let sz = snapValue(z);
  const guidesX: number[] = [];
  const guidesZ: number[] = [];

  // Building edge snapping
  const edgesX = [0, buildingW - w, buildingW];
  const edgesZ = [0, buildingD - d, buildingD];

  for (const ex of edgesX) {
    if (Math.abs(sx - ex) < threshold) { sx = ex; guidesX.push(ex); }
    if (Math.abs(sx + w - ex) < threshold) { sx = ex - w; guidesX.push(ex); }
  }
  for (const ez of edgesZ) {
    if (Math.abs(sz - ez) < threshold) { sz = ez; guidesZ.push(ez); }
    if (Math.abs(sz + d - ez) < threshold) { sz = ez - d; guidesZ.push(ez); }
  }

  // Other room edge snapping
  for (const r of otherRooms) {
    const roomEdgesX = [r.x, r.x + r.width];
    const roomEdgesZ = [r.z, r.z + r.depth];
    for (const ex of roomEdgesX) {
      if (Math.abs(sx - ex) < threshold) { sx = ex; guidesX.push(ex); }
      if (Math.abs(sx + w - ex) < threshold) { sx = ex - w; guidesX.push(ex); }
    }
    for (const ez of roomEdgesZ) {
      if (Math.abs(sz - ez) < threshold) { sz = ez; guidesZ.push(ez); }
      if (Math.abs(sz + d - ez) < threshold) { sz = ez - d; guidesZ.push(ez); }
    }
  }

  return { x: sx, z: sz, guidesX, guidesZ };
}

// ── Snap Guide Lines ──
function SnapGuides({ guidesX, guidesZ, buildingDepth, buildingWidth, floorY, height }: {
  guidesX: number[];
  guidesZ: number[];
  buildingWidth: number;
  buildingDepth: number;
  floorY: number;
  height: number;
}) {
  if (guidesX.length === 0 && guidesZ.length === 0) return null;
  const y = floorY + height / 2;
  return (
    <group>
      {guidesX.map((x, i) => (
        <Line key={`gx-${i}`} points={[[x, y, -0.5], [x, y, buildingDepth + 0.5]]} color="#f97316" lineWidth={1} dashed dashSize={0.1} gapSize={0.1} />
      ))}
      {guidesZ.map((z, i) => (
        <Line key={`gz-${i}`} points={[[-0.5, y, z], [buildingWidth + 0.5, y, z]]} color="#f97316" lineWidth={1} dashed dashSize={0.1} gapSize={0.1} />
      ))}
    </group>
  );
}

// ── Dimension line between two points ──
function DimensionLine({ start, end, offset, label }: {
  start: [number, number, number];
  end: [number, number, number];
  offset: [number, number, number];
  label: string;
}) {
  const s: [number, number, number] = [start[0] + offset[0], start[1] + offset[1], start[2] + offset[2]];
  const e: [number, number, number] = [end[0] + offset[0], end[1] + offset[1], end[2] + offset[2]];
  const mid: [number, number, number] = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2, (s[2] + e[2]) / 2];

  return (
    <group>
      <Line points={[s, e]} color="#dc2626" lineWidth={1} />
      <Text position={mid} fontSize={0.2} color="#dc2626" anchorX="center" anchorY="bottom">
        {label}
      </Text>
    </group>
  );
}

// ── Room Box in 3D ──
function Room3D({
  room,
  floorY,
  ceilingHeight,
  selected,
  onSelect,
  onDrag,
  onDragStart,
  onDragEnd,
  onResize,
}: {
  room: RoomData;
  floorY: number;
  ceilingHeight: number;
  selected: boolean;
  onSelect: () => void;
  onDrag: (dx: number, dz: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onResize: (edge: string, delta: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<string | null>(null);
  const dragRef = useRef({ x: 0, z: 0 });
  const resizeRef = useRef(0);

  const color = CATEGORY_COLORS[room.category];
  const wallH = ceilingHeight * 0.95;
  const cx = room.x + room.width / 2;
  const cz = room.z + room.depth / 2;

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onSelect();
      setDragging(true);
      onDragStart();
      dragRef.current = { x: e.point.x, z: e.point.z };
    },
    [onSelect, onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (dragging) {
        e.stopPropagation();
        const dx = e.point.x - dragRef.current.x;
        const dz = e.point.z - dragRef.current.z;
        dragRef.current = { x: e.point.x, z: e.point.z };
        onDrag(dx, dz);
      }
      if (resizing) {
        e.stopPropagation();
        const val = resizing === "right" || resizing === "left" ? e.point.x : e.point.z;
        const delta = val - resizeRef.current;
        resizeRef.current = val;
        onResize(resizing, delta);
      }
    },
    [dragging, resizing, onDrag, onResize]
  );

  const handlePointerUp = useCallback(() => {
    if (dragging) { setDragging(false); onDragEnd(); }
    if (resizing) setResizing(null);
  }, [dragging, resizing, onDragEnd]);

  // Resize handles for selected room
  const handleSize = 0.15;
  const handles = selected
    ? [
        { id: "right", pos: [room.width / 2, 0, 0] as [number, number, number], cursor: "ew-resize" },
        { id: "left", pos: [-room.width / 2, 0, 0] as [number, number, number], cursor: "ew-resize" },
        { id: "front", pos: [0, 0, room.depth / 2] as [number, number, number], cursor: "ns-resize" },
        { id: "back", pos: [0, 0, -room.depth / 2] as [number, number, number], cursor: "ns-resize" },
      ]
    : [];

  return (
    <group position={[cx, floorY + wallH / 2, cz]}>
      {/* Room body */}
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => {
          setHovered(false);
          if (dragging) { setDragging(false); onDragEnd(); }
          if (resizing) setResizing(null);
        }}
      >
        <boxGeometry args={[room.width, wallH, room.depth]} />
        <meshStandardMaterial
          color={dragging ? "#2563eb" : selected ? "#3b82f6" : hovered ? "#60a5fa" : color}
          opacity={dragging ? 0.5 : selected ? 0.75 : 0.65}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Edges */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(room.width, wallH, room.depth)]} />
        <lineBasicMaterial color={selected || dragging ? "#1d4ed8" : hovered ? "#3b82f6" : "#64748b"} />
      </lineSegments>

      {/* Room name on floor */}
      <Text
        position={[0, -wallH / 2 + 0.05, -room.depth * 0.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(room.width, room.depth) * 0.16}
        color="#1e293b"
        anchorX="center"
        anchorY="middle"
        maxWidth={room.width * 0.85}
      >
        {room.name}
      </Text>
      <Text
        position={[0, -wallH / 2 + 0.05, room.depth * 0.15]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(room.width, room.depth) * 0.11}
        color="#64748b"
        anchorX="center"
        anchorY="middle"
      >
        {roomArea(room).toFixed(1)} m²
      </Text>

      {/* Resize handles */}
      {handles.map((h) => (
        <mesh
          key={h.id}
          position={h.pos}
          onPointerDown={(e) => {
            e.stopPropagation();
            setResizing(h.id);
            resizeRef.current = h.id === "right" || h.id === "left" ? e.point.x : e.point.z;
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <sphereGeometry args={[handleSize, 8, 8]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      ))}

      {/* Hover tooltip */}
      {hovered && !dragging && !resizing && (
        <Html position={[0, wallH / 2 + 0.4, 0]} center>
          <div className="bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
            <strong>{room.name}</strong>
            <span className="text-gray-400 ml-1">({CATEGORY_LABELS[room.category]})</span>
            <br />
            {room.width.toFixed(2)} × {room.depth.toFixed(2)} m = {roomArea(room).toFixed(1)} m²
          </div>
        </Html>
      )}

      {/* Selected room dimensions */}
      {selected && !dragging && (
        <>
          <DimensionLine
            start={[-room.width / 2, -wallH / 2, room.depth / 2 + 0.3]}
            end={[room.width / 2, -wallH / 2, room.depth / 2 + 0.3]}
            offset={[0, 0, 0]}
            label={`${room.width.toFixed(2)} m`}
          />
          <DimensionLine
            start={[room.width / 2 + 0.3, -wallH / 2, -room.depth / 2]}
            end={[room.width / 2 + 0.3, -wallH / 2, room.depth / 2]}
            offset={[0, 0, 0]}
            label={`${room.depth.toFixed(2)} m`}
          />
        </>
      )}
    </group>
  );
}

// ── Floor slab ──
function FloorSlab({ width, depth, y, floorIndex }: { width: number; depth: number; y: number; floorIndex: number }) {
  const colors = ["#cbd5e1", "#bfdbfe", "#bbf7d0", "#fef08a", "#fecaca"];
  return (
    <mesh position={[width / 2, y - 0.05, depth / 2]} receiveShadow>
      <boxGeometry args={[width + 0.1, 0.1, depth + 0.1]} />
      <meshStandardMaterial color={colors[floorIndex % colors.length]} opacity={0.4} transparent />
    </mesh>
  );
}

// ── Roof ──
function Roof({ width, depth, baseY, roofType, pitch }: { width: number; depth: number; baseY: number; roofType: RoofType; pitch: number }) {
  const roofHeight = roofType === "Flachdach" ? 0.2 : (width / 2) * Math.tan((pitch * Math.PI) / 180);

  if (roofType === "Flachdach") {
    return (
      <mesh position={[width / 2, baseY + 0.1, depth / 2]}>
        <boxGeometry args={[width + 0.4, 0.2, depth + 0.4]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
    );
  }

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const hw = width / 2 + 0.2;
    s.moveTo(-hw, 0);
    s.lineTo(0, roofHeight);
    s.lineTo(hw, 0);
    s.lineTo(-hw, 0);
    return s;
  }, [width, roofHeight]);

  const extrudeSettings = useMemo(() => ({ depth: depth + 0.4, bevelEnabled: false }), [depth]);

  return (
    <mesh position={[width / 2, baseY, -0.2]}>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color="#92400e" opacity={0.7} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Building outline ──
function BuildingOutline({ width, depth }: { width: number; depth: number }) {
  const points = useMemo((): [number, number, number][] => [
    [0, 0.01, 0], [width, 0.01, 0], [width, 0.01, depth], [0, 0.01, depth], [0, 0.01, 0],
  ], [width, depth]);
  return <Line points={points} color="#ef4444" lineWidth={2} />;
}

// ── 3D Scene ──
function Scene({
  building,
  selectedRoom,
  exploded,
  snapGuides,
  onSelectRoom,
  onRoomDrag,
  onRoomDragStart,
  onRoomDragEnd,
  onRoomResize,
}: {
  building: BuildingData;
  selectedRoom: string | null;
  exploded: boolean;
  snapGuides: { x: number[]; z: number[]; floorY: number; height: number } | null;
  onSelectRoom: (id: string | null) => void;
  onRoomDrag: (roomId: string, floorId: string, dx: number, dz: number) => void;
  onRoomDragStart: () => void;
  onRoomDragEnd: () => void;
  onRoomResize: (roomId: string, floorId: string, edge: string, delta: number) => void;
}) {
  const controlsRef = useRef<any>(null);
  const EXPLODE_GAP = 1.5;

  const sortedFloors = useMemo(
    () => [...building.floors].sort((a, b) => a.level - b.level),
    [building.floors]
  );

  let currentY = 0;
  const floorPositions = sortedFloors.map((floor, i) => {
    const y = currentY;
    currentY += floor.ceilingHeight + (exploded ? EXPLODE_GAP : 0);
    return { floor, y, index: i };
  });

  const totalHeight = currentY;
  const centerX = building.width / 2;
  const centerY = totalHeight / 2;
  const centerZ = building.depth / 2;

  // Disable orbit controls while dragging
  const handleDragStart = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = false;
    onRoomDragStart();
  }, [onRoomDragStart]);

  const handleDragEnd = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = true;
    onRoomDragEnd();
  }, [onRoomDragEnd]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Ground — click to deselect */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.01, centerZ]} receiveShadow
        onPointerDown={() => onSelectRoom(null)}>
        <planeGeometry args={[building.width + 12, building.depth + 12]} />
        <meshStandardMaterial color="#f1f5f9" opacity={0.5} transparent />
      </mesh>

      <Grid
        args={[40, 40]}
        position={[centerX, 0, centerZ]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#e2e8f0"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#cbd5e1"
        fadeDistance={40}
        infiniteGrid={false}
      />

      <BuildingOutline width={building.width} depth={building.depth} />

      {/* Building dimension lines */}
      <DimensionLine
        start={[0, 0, building.depth + 0.5]}
        end={[building.width, 0, building.depth + 0.5]}
        offset={[0, 0, 0]}
        label={`${building.width.toFixed(2)} m`}
      />
      <DimensionLine
        start={[building.width + 0.5, 0, 0]}
        end={[building.width + 0.5, 0, building.depth]}
        offset={[0, 0, 0]}
        label={`${building.depth.toFixed(2)} m`}
      />

      {/* Floors and rooms */}
      {floorPositions.map(({ floor, y, index }) => (
        <group key={floor.id}>
          <FloorSlab width={building.width} depth={building.depth} y={y} floorIndex={index} />
          {floor.rooms.map((room) => (
            <Room3D
              key={room.id}
              room={room}
              floorY={y}
              ceilingHeight={floor.ceilingHeight}
              selected={selectedRoom === room.id}
              onSelect={() => onSelectRoom(room.id)}
              onDrag={(dx, dz) => onRoomDrag(room.id, floor.id, dx, dz)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onResize={(edge, delta) => onRoomResize(room.id, floor.id, edge, delta)}
            />
          ))}

          {/* Floor label */}
          <Text position={[-0.8, y + floor.ceilingHeight / 2, centerZ]} fontSize={0.35} color="#1e3a5f" anchorX="right" anchorY="middle" fontWeight="bold">
            {floor.name}
          </Text>

          {/* Floor height label */}
          <Text position={[building.width + 1.2, y + floor.ceilingHeight / 2, centerZ]} fontSize={0.2} color="#dc2626" anchorX="left" anchorY="middle">
            {floor.ceilingHeight.toFixed(2)} m
          </Text>
        </group>
      ))}

      {/* Snap guides */}
      {snapGuides && (
        <SnapGuides
          guidesX={snapGuides.x}
          guidesZ={snapGuides.z}
          buildingWidth={building.width}
          buildingDepth={building.depth}
          floorY={snapGuides.floorY}
          height={snapGuides.height}
        />
      )}

      {/* Roof */}
      <Roof width={building.width} depth={building.depth} baseY={totalHeight - (exploded ? EXPLODE_GAP * (sortedFloors.length - 1) : 0) + (exploded ? EXPLODE_GAP * sortedFloors.length : 0)} roofType={building.roofType} pitch={building.roofPitchDegrees} />

      <OrbitControls
        ref={controlsRef}
        target={[centerX, centerY, centerZ]}
        maxPolarAngle={Math.PI * 0.85}
        minDistance={3}
        maxDistance={60}
        enableDamping
        dampingFactor={0.05}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />
    </>
  );
}

// ── Side Panel ──
function SidePanel({
  building,
  selectedRoom,
  onChange,
  onSelectRoom,
  onDuplicateRoom,
}: {
  building: BuildingData;
  selectedRoom: string | null;
  onChange: (b: BuildingData) => void;
  onSelectRoom: (id: string | null) => void;
  onDuplicateRoom: (roomId: string, floorId: string) => void;
}) {
  let selectedRoomData: RoomData | null = null;
  let selectedFloor: FloorData | null = null;
  if (selectedRoom) {
    for (const floor of building.floors) {
      const room = floor.rooms.find((r) => r.id === selectedRoom);
      if (room) { selectedRoomData = room; selectedFloor = floor; break; }
    }
  }

  const updateRoom = (roomId: string, floorId: string, updates: Partial<RoomData>) => {
    onChange({
      ...building,
      floors: building.floors.map((f) =>
        f.id === floorId ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...updates } : r)) } : f
      ),
    });
  };

  const deleteRoom = (roomId: string, floorId: string) => {
    onSelectRoom(null);
    onChange({
      ...building,
      floors: building.floors.map((f) =>
        f.id === floorId ? { ...f, rooms: f.rooms.filter((r) => r.id !== roomId) } : f
      ),
    });
  };

  const addRoom = (floorId: string) => {
    // Find a free spot
    const floor = building.floors.find((f) => f.id === floorId);
    let newX = 0;
    if (floor) {
      const maxRight = Math.max(0, ...floor.rooms.map((r) => r.x + r.width));
      newX = maxRight < building.width - 2 ? maxRight : 0;
    }
    const newRoom = createRoom({ name: "Neuer Raum", x: newX });
    onSelectRoom(newRoom.id);
    onChange({
      ...building,
      floors: building.floors.map((f) =>
        f.id === floorId ? { ...f, rooms: [...f.rooms, newRoom] } : f
      ),
    });
  };

  const addFloor = () => {
    const maxLevel = Math.max(...building.floors.map((f) => f.level), -1);
    const newLevel = maxLevel + 1;
    const names: Record<number, string> = { [-1]: "Kellergeschoss", 0: "Erdgeschoss", 1: "Obergeschoss", 2: "2. Obergeschoss", 3: "Dachgeschoss" };
    const newFloor = createFloor({ name: names[newLevel] || `${newLevel}. OG`, level: newLevel });
    onChange({ ...building, floors: [...building.floors, newFloor] });
  };

  const addBasement = () => {
    const minLevel = Math.min(...building.floors.map((f) => f.level), 0);
    const newLevel = minLevel - 1;
    const newFloor = createFloor({ name: newLevel === -1 ? "Kellergeschoss" : `${Math.abs(newLevel)}. UG`, level: newLevel, ceilingHeight: 2.2 });
    onChange({ ...building, floors: [...building.floors, newFloor] });
  };

  const deleteFloor = (floorId: string) => {
    onSelectRoom(null);
    onChange({ ...building, floors: building.floors.filter((f) => f.id !== floorId) });
  };

  const updateFloor = (floorId: string, updates: Partial<FloorData>) => {
    onChange({
      ...building,
      floors: building.floors.map((f) => (f.id === floorId ? { ...f, ...updates } : f)),
    });
  };

  const sortedFloors = [...building.floors].sort((a, b) => b.level - a.level);

  return (
    <div className="w-80 bg-white border-l overflow-y-auto flex flex-col">
      {/* Building settings */}
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm text-gray-800 mb-3">Gebäude</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="text-gray-600 self-center">Breite (m)</label>
          <input type="number" step="0.1" value={building.width} onChange={(e) => onChange({ ...building, width: +e.target.value || 1 })} className="border rounded px-2 py-1 text-right" />
          <label className="text-gray-600 self-center">Tiefe (m)</label>
          <input type="number" step="0.1" value={building.depth} onChange={(e) => onChange({ ...building, depth: +e.target.value || 1 })} className="border rounded px-2 py-1 text-right" />
          <label className="text-gray-600 self-center">Dach</label>
          <select value={building.roofType} onChange={(e) => onChange({ ...building, roofType: e.target.value as RoofType })} className="border rounded px-2 py-1">
            <option value="Satteldach">Satteldach</option>
            <option value="Flachdach">Flachdach</option>
            <option value="Walmdach">Walmdach</option>
            <option value="Pultdach">Pultdach</option>
          </select>
          {building.roofType !== "Flachdach" && (
            <>
              <label className="text-gray-600 self-center">Neigung (°)</label>
              <input type="number" step="1" min="10" max="60" value={building.roofPitchDegrees} onChange={(e) => onChange({ ...building, roofPitchDegrees: +e.target.value || 35 })} className="border rounded px-2 py-1 text-right" />
            </>
          )}
        </div>
      </div>

      {/* Floors */}
      <div className="flex-1 overflow-y-auto">
        {sortedFloors.map((floor) => (
          <div key={floor.id} className="border-b">
            <div className="flex items-center justify-between p-3 bg-gray-50">
              <div className="flex-1 min-w-0">
                <input
                  value={floor.name}
                  onChange={(e) => updateFloor(floor.id, { name: e.target.value })}
                  className="font-medium text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full"
                />
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  <span>H:</span>
                  <input type="number" step="0.1" min="2" max="5" value={floor.ceilingHeight}
                    onChange={(e) => updateFloor(floor.id, { ceilingHeight: +e.target.value || 2.5 })}
                    className="w-12 border rounded px-1 py-0.5 text-right bg-white" />
                  <span>m · {floor.rooms.length} Räume · {floor.rooms.reduce((s, r) => s + roomArea(r), 0).toFixed(1)} m²</span>
                </div>
              </div>
              <div className="flex gap-1 ml-2 shrink-0">
                <button onClick={() => addRoom(floor.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Raum hinzufügen">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
                {building.floors.length > 1 && (
                  <button onClick={() => deleteFloor(floor.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Stockwerk löschen">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y">
              {floor.rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => onSelectRoom(room.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${selectedRoom === room.id ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">{room.name}</span>
                    <span className="text-xs text-gray-500">{roomArea(room).toFixed(1)} m²</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {room.width.toFixed(2)} × {room.depth.toFixed(2)} m · {CATEGORY_LABELS[room.category]}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add floor buttons */}
      <div className="p-3 border-t space-y-2">
        <button onClick={addFloor} className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors">
          + Stockwerk oben
        </button>
        <button onClick={addBasement} className="w-full py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors">
          + Keller / UG unten
        </button>
      </div>

      {/* Selected room editor */}
      {selectedRoomData && selectedFloor && (
        <div className="border-t bg-blue-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm text-gray-800">Raum bearbeiten</h4>
            <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">{selectedFloor.name}</span>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <label className="text-xs text-gray-600">Name</label>
              <input value={selectedRoomData.name} onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { name: e.target.value })} className="w-full border rounded px-2 py-1 mt-0.5" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">Breite (m)</label>
                <input type="number" step="0.05" min="0.5" value={selectedRoomData.width} onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { width: +e.target.value || 1 })} className="w-full border rounded px-2 py-1 mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Tiefe (m)</label>
                <input type="number" step="0.05" min="0.5" value={selectedRoomData.depth} onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { depth: +e.target.value || 1 })} className="w-full border rounded px-2 py-1 mt-0.5" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">Kategorie</label>
              <select value={selectedRoomData.category} onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { category: e.target.value as RoomCategory })} className="w-full border rounded px-2 py-1 mt-0.5">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onDuplicateRoom(selectedRoomData!.id, selectedFloor!.id)}
                className="flex-1 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
              >
                Duplizieren
              </button>
              <button
                onClick={() => deleteRoom(selectedRoomData!.id, selectedFloor!.id)}
                className="flex-1 py-1.5 text-sm text-red-600 hover:bg-red-100 rounded border border-red-200 transition-colors"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Undo History ──
function useHistory<T>(initial: T) {
  const [history, setHistory] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);

  const current = history[index];

  const push = useCallback((value: T) => {
    setHistory((h) => [...h.slice(0, index + 1), value].slice(-50));
    setIndex((i) => i + 1);
  }, [index]);

  const undo = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setIndex((i) => Math.min(history.length - 1, i + 1));
  }, [history.length]);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  return { current, push, undo, redo, canUndo, canRedo };
}

// ── Main Component ──
export default function BuildingEditor3D({ building, onChange }: BuildingEditor3DProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ x: number[]; z: number[]; floorY: number; height: number } | null>(null);
  const { current: historyBuilding, push: pushHistory, undo, redo, canUndo, canRedo } = useHistory(building);

  // Sync external changes
  useEffect(() => {
    if (building !== historyBuilding) {
      onChange(historyBuilding);
    }
  }, [historyBuilding]);

  const updateBuilding = useCallback((b: BuildingData) => {
    pushHistory(b);
    onChange(b);
  }, [pushHistory, onChange]);

  // Accumulate drag deltas, apply snapping
  const dragAccum = useRef({ x: 0, z: 0 });

  const handleRoomDragStart = useCallback(() => {
    dragAccum.current = { x: 0, z: 0 };
  }, []);

  const handleRoomDrag = useCallback(
    (roomId: string, floorId: string, dx: number, dz: number) => {
      const floor = building.floors.find((f) => f.id === floorId);
      const room = floor?.rooms.find((r) => r.id === roomId);
      if (!room || !floor) return;

      const otherRooms = floor.rooms.filter((r) => r.id !== roomId);
      const rawX = room.x + dx;
      const rawZ = room.z + dz;
      const snapped = snapWithGuides(rawX, rawZ, room.width, room.depth, building.width, building.depth, otherRooms);

      setSnapGuides({
        x: snapped.guidesX,
        z: snapped.guidesZ,
        floorY: building.floors.sort((a, b) => a.level - b.level).reduce((y, f) => f.id === floorId ? y : y + f.ceilingHeight, 0),
        height: floor.ceilingHeight,
      });

      // Clamp within building
      const clampedX = Math.max(0, Math.min(snapped.x, building.width - room.width));
      const clampedZ = Math.max(0, Math.min(snapped.z, building.depth - room.depth));

      onChange({
        ...building,
        floors: building.floors.map((f) =>
          f.id === floorId
            ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, x: clampedX, z: clampedZ } : r)) }
            : f
        ),
      });
    },
    [building, onChange]
  );

  const handleRoomDragEnd = useCallback(() => {
    setSnapGuides(null);
    pushHistory(building);
  }, [building, pushHistory]);

  const handleRoomResize = useCallback(
    (roomId: string, floorId: string, edge: string, delta: number) => {
      onChange({
        ...building,
        floors: building.floors.map((f) =>
          f.id === floorId
            ? {
                ...f,
                rooms: f.rooms.map((r) => {
                  if (r.id !== roomId) return r;
                  const updated = { ...r };
                  if (edge === "right") updated.width = Math.max(0.5, snapValue(r.width + delta));
                  if (edge === "left") {
                    const newW = Math.max(0.5, snapValue(r.width - delta));
                    updated.x = snapValue(r.x + (r.width - newW));
                    updated.width = newW;
                  }
                  if (edge === "front") updated.depth = Math.max(0.5, snapValue(r.depth + delta));
                  if (edge === "back") {
                    const newD = Math.max(0.5, snapValue(r.depth - delta));
                    updated.z = snapValue(r.z + (r.depth - newD));
                    updated.depth = newD;
                  }
                  return updated;
                }),
              }
            : f
        ),
      });
    },
    [building, onChange]
  );

  const handleDuplicateRoom = useCallback(
    (roomId: string, floorId: string) => {
      const floor = building.floors.find((f) => f.id === floorId);
      const room = floor?.rooms.find((r) => r.id === roomId);
      if (!room) return;
      const newRoom = createRoom({
        ...room,
        id: undefined as unknown as string,
        name: room.name + " (Kopie)",
        x: Math.min(room.x + 0.5, building.width - room.width),
        z: Math.min(room.z + 0.5, building.depth - room.depth),
      });
      setSelectedRoom(newRoom.id);
      updateBuilding({
        ...building,
        floors: building.floors.map((f) =>
          f.id === floorId ? { ...f, rooms: [...f.rooms, newRoom] } : f
        ),
      });
    },
    [building, updateBuilding]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedRoom) {
        for (const floor of building.floors) {
          if (floor.rooms.find((r) => r.id === selectedRoom)) {
            setSelectedRoom(null);
            updateBuilding({
              ...building,
              floors: building.floors.map((f) =>
                f.id === floor.id ? { ...f, rooms: f.rooms.filter((r) => r.id !== selectedRoom) } : f
              ),
            });
            break;
          }
        }
      }

      if (e.key === "Escape") setSelectedRoom(null);

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey && canUndo) {
        e.preventDefault();
        undo();
        onChange(historyBuilding);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.shiftKey && e.key === "z")) && canRedo) {
        e.preventDefault();
        redo();
        onChange(historyBuilding);
      }

      // Arrow keys to nudge selected room
      if (selectedRoom && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : 0.05;
        for (const floor of building.floors) {
          const room = floor.rooms.find((r) => r.id === selectedRoom);
          if (room) {
            let { x, z } = room;
            if (e.key === "ArrowLeft") x = Math.max(0, x - step);
            if (e.key === "ArrowRight") x = Math.min(building.width - room.width, x + step);
            if (e.key === "ArrowUp") z = Math.max(0, z - step);
            if (e.key === "ArrowDown") z = Math.min(building.depth - room.depth, z + step);
            updateBuilding({
              ...building,
              floors: building.floors.map((f) =>
                f.id === floor.id ? { ...f, rooms: f.rooms.map((r) => (r.id === selectedRoom ? { ...r, x: snapValue(x), z: snapValue(z) } : r)) } : f
              ),
            });
            break;
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRoom, building, canUndo, canRedo, undo, redo, historyBuilding, onChange, updateBuilding]);

  const totalHeight = building.floors.reduce((s, f) => s + f.ceilingHeight, 0);

  return (
    <div className="flex h-full">
      <div className="flex-1 relative">
        <Canvas
          camera={{
            position: [building.width * 1.8, totalHeight * 1.5, building.depth * 1.8],
            fov: 50,
            near: 0.1,
            far: 200,
          }}
          shadows
        >
          <Scene
            building={building}
            selectedRoom={selectedRoom}
            exploded={exploded}
            snapGuides={snapGuides}
            onSelectRoom={setSelectedRoom}
            onRoomDrag={handleRoomDrag}
            onRoomDragStart={handleRoomDragStart}
            onRoomDragEnd={handleRoomDragEnd}
            onRoomResize={handleRoomResize}
          />
        </Canvas>

        {/* Toolbar */}
        <div className="absolute top-4 left-4 flex gap-2">
          <button onClick={() => setExploded(!exploded)}
            className={`px-3 py-1.5 text-xs rounded-lg border shadow-sm transition-colors ${exploded ? "bg-blue-600 border-blue-700 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {exploded ? "Zusammenklappen" : "Explosionsansicht"}
          </button>
          <button onClick={undo} disabled={!canUndo}
            className="px-2 py-1.5 text-xs rounded-lg border shadow-sm bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Rückgängig (Ctrl+Z)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
          </button>
          <button onClick={redo} disabled={!canRedo}
            className="px-2 py-1.5 text-xs rounded-lg border shadow-sm bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Wiederholen (Ctrl+Y)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" /></svg>
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-white/90 backdrop-blur rounded-lg px-3 py-2 space-y-0.5">
          <div><kbd className="bg-gray-100 px-1 rounded">LMB</kbd> Drehen · <kbd className="bg-gray-100 px-1 rounded">RMB</kbd> Verschieben · <kbd className="bg-gray-100 px-1 rounded">Scroll</kbd> Zoom</div>
          <div><kbd className="bg-gray-100 px-1 rounded">Pfeiltasten</kbd> Raum bewegen · <kbd className="bg-gray-100 px-1 rounded">Shift</kbd> größere Schritte</div>
          <div><kbd className="bg-gray-100 px-1 rounded">Del</kbd> Löschen · <kbd className="bg-gray-100 px-1 rounded">Esc</kbd> Abwählen · <kbd className="bg-gray-100 px-1 rounded">Ctrl+Z</kbd> Rückgängig</div>
        </div>
      </div>

      <SidePanel
        building={building}
        selectedRoom={selectedRoom}
        onChange={updateBuilding}
        onSelectRoom={setSelectedRoom}
        onDuplicateRoom={handleDuplicateRoom}
      />
    </div>
  );
}
