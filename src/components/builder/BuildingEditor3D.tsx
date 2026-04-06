"use client";

import { useRef, useState, useMemo, useCallback } from "react";
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

const FLOOR_OPACITY = 0.7;

// ── Room Box in 3D ──
function Room3D({
  room,
  floorY,
  ceilingHeight,
  selected,
  onSelect,
  onDragEnd,
}: {
  room: RoomData;
  floorY: number;
  ceilingHeight: number;
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, z: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, z: 0, roomX: 0, roomZ: 0 });

  const color = CATEGORY_COLORS[room.category];
  const wallH = ceilingHeight * 0.95;
  const cx = room.x + room.width / 2;
  const cz = room.z + room.depth / 2;

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onSelect();
      setDragging(true);
      const point = e.point;
      dragStart.current = { x: point.x, z: point.z, roomX: room.x, roomZ: room.z };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [room.x, room.z, onSelect]
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragging) return;
      e.stopPropagation();
      const dx = e.point.x - dragStart.current.x;
      const dz = e.point.z - dragStart.current.z;
      const newX = Math.round((dragStart.current.roomX + dx) * 20) / 20; // 5cm snap
      const newZ = Math.round((dragStart.current.roomZ + dz) * 20) / 20;
      onDragEnd(newX, newZ);
    },
    [dragging, onDragEnd]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  return (
    <group position={[cx, floorY + wallH / 2, cz]}>
      {/* Room walls */}
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => {
          setHovered(false);
          if (dragging) setDragging(false);
        }}
      >
        <boxGeometry args={[room.width, wallH, room.depth]} />
        <meshStandardMaterial
          color={selected ? "#3b82f6" : hovered ? "#60a5fa" : color}
          opacity={selected ? 0.8 : FLOOR_OPACITY}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Edges */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(room.width, wallH, room.depth)]} />
        <lineBasicMaterial color={selected ? "#1d4ed8" : "#475569"} />
      </lineSegments>

      {/* Room name on floor */}
      <Text
        position={[0, -wallH / 2 + 0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(room.width, room.depth) * 0.18}
        color="#1e293b"
        anchorX="center"
        anchorY="middle"
        maxWidth={room.width * 0.9}
      >
        {room.name}
      </Text>

      {/* Area label */}
      <Text
        position={[0, -wallH / 2 + 0.05, room.depth * 0.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(room.width, room.depth) * 0.12}
        color="#64748b"
        anchorX="center"
        anchorY="middle"
      >
        {roomArea(room).toFixed(1)} m²
      </Text>

      {/* Hover tooltip */}
      {hovered && !dragging && (
        <Html position={[0, wallH / 2 + 0.3, 0]} center>
          <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
            <strong>{room.name}</strong> ({CATEGORY_LABELS[room.category]})
            <br />
            {room.width.toFixed(2)} × {room.depth.toFixed(2)} m = {roomArea(room).toFixed(1)} m²
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Floor slab ──
function FloorSlab({
  width,
  depth,
  y,
  floorIndex,
}: {
  width: number;
  depth: number;
  y: number;
  floorIndex: number;
}) {
  const colors = ["#cbd5e1", "#bfdbfe", "#bbf7d0", "#fef08a", "#fecaca"];
  return (
    <mesh position={[width / 2, y - 0.05, depth / 2]} receiveShadow>
      <boxGeometry args={[width + 0.1, 0.1, depth + 0.1]} />
      <meshStandardMaterial
        color={colors[floorIndex % colors.length]}
        opacity={0.4}
        transparent
      />
    </mesh>
  );
}

// ── Roof ──
function Roof({
  width,
  depth,
  baseY,
  roofType,
  pitch,
}: {
  width: number;
  depth: number;
  baseY: number;
  roofType: RoofType;
  pitch: number;
}) {
  const roofHeight =
    roofType === "Flachdach"
      ? 0.2
      : (width / 2) * Math.tan((pitch * Math.PI) / 180);

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

  const extrudeSettings = useMemo(
    () => ({ depth: depth + 0.4, bevelEnabled: false }),
    [depth]
  );

  return (
    <mesh position={[width / 2, baseY, -0.2]}>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial
        color="#92400e"
        opacity={0.7}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Building outline on ground ──
function BuildingOutline({ width, depth }: { width: number; depth: number }) {
  const points = useMemo(
    (): [number, number, number][] => [
      [0, 0.01, 0],
      [width, 0.01, 0],
      [width, 0.01, depth],
      [0, 0.01, depth],
      [0, 0.01, 0],
    ],
    [width, depth]
  );

  return <Line points={points} color="#ef4444" lineWidth={2} />;
}

// ── 3D Scene ──
function Scene({
  building,
  selectedRoom,
  onSelectRoom,
  onRoomMove,
}: {
  building: BuildingData;
  selectedRoom: string | null;
  onSelectRoom: (id: string | null) => void;
  onRoomMove: (roomId: string, floorId: string, x: number, z: number) => void;
}) {
  const sortedFloors = useMemo(
    () => [...building.floors].sort((a, b) => a.level - b.level),
    [building.floors]
  );

  let currentY = 0;
  const floorPositions = sortedFloors.map((floor, i) => {
    const y = currentY;
    currentY += floor.ceilingHeight;
    return { floor, y, index: i };
  });

  const totalHeight = currentY;
  const centerX = building.width / 2;
  const centerY = totalHeight / 2;
  const centerZ = building.depth / 2;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.01, centerZ]} receiveShadow
        onPointerDown={() => onSelectRoom(null)}>
        <planeGeometry args={[building.width + 8, building.depth + 8]} />
        <meshStandardMaterial color="#f1f5f9" opacity={0.5} transparent />
      </mesh>

      <Grid
        args={[30, 30]}
        position={[centerX, 0, centerZ]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#e2e8f0"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#cbd5e1"
        fadeDistance={30}
        infiniteGrid={false}
      />

      {/* Building outline */}
      <BuildingOutline width={building.width} depth={building.depth} />

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
              onDragEnd={(x, z) => onRoomMove(room.id, floor.id, x, z)}
            />
          ))}

          {/* Floor label */}
          <Text
            position={[-0.8, y + floor.ceilingHeight / 2, centerZ]}
            fontSize={0.35}
            color="#1e3a5f"
            anchorX="right"
            anchorY="middle"
            fontWeight="bold"
          >
            {floor.name}
          </Text>
        </group>
      ))}

      {/* Roof */}
      <Roof
        width={building.width}
        depth={building.depth}
        baseY={totalHeight}
        roofType={building.roofType}
        pitch={building.roofPitchDegrees}
      />

      <OrbitControls
        target={[centerX, centerY, centerZ]}
        maxPolarAngle={Math.PI * 0.85}
        minDistance={3}
        maxDistance={60}
        enableDamping
        dampingFactor={0.05}
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
}: {
  building: BuildingData;
  selectedRoom: string | null;
  onChange: (b: BuildingData) => void;
  onSelectRoom: (id: string | null) => void;
}) {
  // Find selected room and its floor
  let selectedRoomData: RoomData | null = null;
  let selectedFloor: FloorData | null = null;
  if (selectedRoom) {
    for (const floor of building.floors) {
      const room = floor.rooms.find((r) => r.id === selectedRoom);
      if (room) {
        selectedRoomData = room;
        selectedFloor = floor;
        break;
      }
    }
  }

  const updateRoom = (roomId: string, floorId: string, updates: Partial<RoomData>) => {
    onChange({
      ...building,
      floors: building.floors.map((f) =>
        f.id === floorId
          ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...updates } : r)) }
          : f
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
    const newRoom = createRoom({ name: "Neuer Raum" });
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
    const names: Record<number, string> = {
      [-1]: "Kellergeschoss",
      0: "Erdgeschoss",
      1: "Obergeschoss",
      2: "2. Obergeschoss",
      3: "Dachgeschoss",
    };
    const newFloor = createFloor({
      name: names[newLevel] || `${newLevel}. OG`,
      level: newLevel,
    });
    onChange({ ...building, floors: [...building.floors, newFloor] });
  };

  const deleteFloor = (floorId: string) => {
    onSelectRoom(null);
    onChange({
      ...building,
      floors: building.floors.filter((f) => f.id !== floorId),
    });
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
          <label className="text-gray-600">Breite</label>
          <input
            type="number"
            step="0.1"
            value={building.width}
            onChange={(e) => onChange({ ...building, width: +e.target.value || 1 })}
            className="border rounded px-2 py-1 text-right"
          />
          <label className="text-gray-600">Tiefe</label>
          <input
            type="number"
            step="0.1"
            value={building.depth}
            onChange={(e) => onChange({ ...building, depth: +e.target.value || 1 })}
            className="border rounded px-2 py-1 text-right"
          />
          <label className="text-gray-600">Dach</label>
          <select
            value={building.roofType}
            onChange={(e) => onChange({ ...building, roofType: e.target.value as RoofType })}
            className="border rounded px-2 py-1"
          >
            <option value="Satteldach">Satteldach</option>
            <option value="Flachdach">Flachdach</option>
            <option value="Walmdach">Walmdach</option>
            <option value="Pultdach">Pultdach</option>
          </select>
          {building.roofType !== "Flachdach" && (
            <>
              <label className="text-gray-600">Neigung</label>
              <input
                type="number"
                step="1"
                min="10"
                max="60"
                value={building.roofPitchDegrees}
                onChange={(e) => onChange({ ...building, roofPitchDegrees: +e.target.value || 35 })}
                className="border rounded px-2 py-1 text-right"
              />
            </>
          )}
        </div>
      </div>

      {/* Floors */}
      <div className="flex-1 overflow-y-auto">
        {sortedFloors.map((floor) => (
          <div key={floor.id} className="border-b">
            <div className="flex items-center justify-between p-3 bg-gray-50">
              <div className="flex-1">
                <input
                  value={floor.name}
                  onChange={(e) => updateFloor(floor.id, { name: e.target.value })}
                  className="font-medium text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full"
                />
                <div className="text-xs text-gray-500 mt-0.5">
                  Höhe: {floor.ceilingHeight}m · {floor.rooms.length} Räume
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                <button
                  onClick={() => addRoom(floor.id)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                  title="Raum hinzufügen"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {building.floors.length > 1 && (
                  <button
                    onClick={() => deleteFloor(floor.id)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    title="Stockwerk löschen"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Room list */}
            <div className="divide-y">
              {floor.rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => onSelectRoom(room.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                    selectedRoom === room.id ? "bg-blue-50 border-l-2 border-blue-500" : ""
                  }`}
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

      {/* Add floor */}
      <div className="p-3 border-t">
        <button
          onClick={addFloor}
          className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
        >
          + Stockwerk hinzufügen
        </button>
      </div>

      {/* Selected room editor */}
      {selectedRoomData && selectedFloor && (
        <div className="border-t bg-blue-50 p-4">
          <h4 className="font-semibold text-sm text-gray-800 mb-3">Raum bearbeiten</h4>
          <div className="space-y-2 text-sm">
            <div>
              <label className="text-xs text-gray-600">Name</label>
              <input
                value={selectedRoomData.name}
                onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { name: e.target.value })}
                className="w-full border rounded px-2 py-1 mt-0.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">Breite (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  value={selectedRoomData.width}
                  onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { width: +e.target.value || 1 })}
                  className="w-full border rounded px-2 py-1 mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Tiefe (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  value={selectedRoomData.depth}
                  onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { depth: +e.target.value || 1 })}
                  className="w-full border rounded px-2 py-1 mt-0.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">X-Position</label>
                <input
                  type="number"
                  step="0.05"
                  value={selectedRoomData.x}
                  onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { x: +e.target.value })}
                  className="w-full border rounded px-2 py-1 mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Z-Position</label>
                <input
                  type="number"
                  step="0.05"
                  value={selectedRoomData.z}
                  onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { z: +e.target.value })}
                  className="w-full border rounded px-2 py-1 mt-0.5"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">Kategorie</label>
              <select
                value={selectedRoomData.category}
                onChange={(e) =>
                  updateRoom(selectedRoomData!.id, selectedFloor!.id, {
                    category: e.target.value as RoomCategory,
                  })
                }
                className="w-full border rounded px-2 py-1 mt-0.5"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => deleteRoom(selectedRoomData!.id, selectedFloor!.id)}
              className="w-full mt-2 py-1.5 text-sm text-red-600 hover:bg-red-100 rounded border border-red-200 transition-colors"
            >
              Raum löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──
export default function BuildingEditor3D({ building, onChange }: BuildingEditor3DProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const handleRoomMove = useCallback(
    (roomId: string, floorId: string, x: number, z: number) => {
      onChange({
        ...building,
        floors: building.floors.map((f) =>
          f.id === floorId
            ? {
                ...f,
                rooms: f.rooms.map((r) =>
                  r.id === roomId ? { ...r, x: Math.max(0, x), z: Math.max(0, z) } : r
                ),
              }
            : f
        ),
      });
    },
    [building, onChange]
  );

  const totalHeight = building.floors.reduce((s, f) => s + f.ceilingHeight, 0);

  return (
    <div className="flex h-full">
      {/* 3D Viewport */}
      <div className="flex-1 relative">
        <Canvas
          camera={{
            position: [
              building.width * 1.8,
              totalHeight * 1.5,
              building.depth * 1.8,
            ],
            fov: 50,
            near: 0.1,
            far: 200,
          }}
          shadows
        >
          <Scene
            building={building}
            selectedRoom={selectedRoom}
            onSelectRoom={setSelectedRoom}
            onRoomMove={handleRoomMove}
          />
        </Canvas>

        {/* Instructions overlay */}
        <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-white/80 backdrop-blur rounded-lg px-3 py-2">
          Ziehen zum Drehen · Scrollen zum Zoomen · Klick auf Raum zum Auswählen
        </div>
      </div>

      {/* Side Panel */}
      <SidePanel
        building={building}
        selectedRoom={selectedRoom}
        onChange={onChange}
        onSelectRoom={setSelectedRoom}
      />
    </div>
  );
}
