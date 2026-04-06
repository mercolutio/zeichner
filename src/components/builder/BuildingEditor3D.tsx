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
  RoofSegment,
  createRoom,
  createFloor,
  createRoofSegment,
  roomArea,
  roofHeight as calcRoofHeight,
  buildingWidth,
  buildingDepth,
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
  wintergarten: "#67e8f9",
  keller: "#d4b896",
  garage: "#e5e7eb",
};

const CATEGORY_LABELS: Record<RoomCategory, string> = {
  wohnraum: "Wohnraum",
  nutzraum: "Nutzraum",
  balkon: "Balkon",
  terrasse: "Terrasse",
  loggia: "Loggia",
  wintergarten: "Wintergarten",
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

// ── Room Box in 3D (display only, drag handled by DragPlane) ──
function Room3D({
  room,
  floorY,
  ceilingHeight,
  selected,
  isDragging,
  isVoid,
  onPointerDown,
}: {
  room: RoomData;
  floorY: number;
  ceilingHeight: number;
  selected: boolean;
  isDragging: boolean;
  isVoid: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = isVoid ? "#ef4444" : CATEGORY_COLORS[room.category];
  const wallH = ceilingHeight * 0.95;
  const cx = room.x + room.width / 2;
  const cz = room.z + room.depth / 2;

  return (
    <group position={[cx, floorY + wallH / 2, cz]}>
      {/* Room body */}
      <mesh
        onPointerDown={onPointerDown}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[room.width, wallH, room.depth]} />
        <meshStandardMaterial
          color={isDragging ? "#2563eb" : selected ? "#3b82f6" : hovered ? "#60a5fa" : color}
          opacity={isVoid ? 0.25 : isDragging ? 0.5 : selected ? 0.75 : 0.65}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Edges */}
      {isVoid ? (
        <Line
          points={[
            [-room.width/2, -wallH/2, -room.depth/2], [room.width/2, -wallH/2, -room.depth/2],
            [room.width/2, -wallH/2, room.depth/2], [-room.width/2, -wallH/2, room.depth/2],
            [-room.width/2, -wallH/2, -room.depth/2],
          ]}
          color="#dc2626" lineWidth={2} dashed dashSize={0.15} gapSize={0.1}
        />
      ) : (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(room.width, wallH, room.depth)]} />
          <lineBasicMaterial color={selected || isDragging ? "#1d4ed8" : hovered ? "#3b82f6" : "#64748b"} />
        </lineSegments>
      )}

      {/* Room name on floor */}
      <Text position={[0, -wallH / 2 + 0.05, -room.depth * 0.1]} rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(room.width, room.depth) * 0.16} color="#1e293b" anchorX="center" anchorY="middle" maxWidth={room.width * 0.85}>
        {room.name}
      </Text>
      <Text position={[0, -wallH / 2 + 0.05, room.depth * 0.15]} rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(room.width, room.depth) * 0.11} color="#64748b" anchorX="center" anchorY="middle">
        {roomArea(room).toFixed(1)} m²
      </Text>

      {/* Resize handles */}
      {selected && !isDragging && ([
        { id: "right", pos: [room.width / 2, 0, 0] },
        { id: "left", pos: [-room.width / 2, 0, 0] },
        { id: "front", pos: [0, 0, room.depth / 2] },
        { id: "back", pos: [0, 0, -room.depth / 2] },
      ] as { id: string; pos: [number, number, number] }[]).map((h) => (
        <mesh key={h.id} position={h.pos}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      ))}

      {/* Hover tooltip */}
      {hovered && !isDragging && (
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
      {selected && !isDragging && (
        <>
          <DimensionLine
            start={[-room.width / 2, -wallH / 2, room.depth / 2 + 0.3]}
            end={[room.width / 2, -wallH / 2, room.depth / 2 + 0.3]}
            offset={[0, 0, 0]} label={`${room.width.toFixed(2)} m`}
          />
          <DimensionLine
            start={[room.width / 2 + 0.3, -wallH / 2, -room.depth / 2]}
            end={[room.width / 2 + 0.3, -wallH / 2, room.depth / 2]}
            offset={[0, 0, 0]} label={`${room.depth.toFixed(2)} m`}
          />
        </>
      )}
    </group>
  );
}

// ── Drag Plane: invisible plane at floor height that captures all mouse movement during drag ──
function DragPlane({
  active,
  floorY,
  onMove,
  onUp,
}: {
  active: boolean;
  floorY: number;
  onMove: (point: THREE.Vector3) => void;
  onUp: () => void;
}) {
  if (!active) return null;
  return (
    <mesh
      position={[0, floorY + 0.01, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(e) => { e.stopPropagation(); onMove(e.point); }}
      onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

// ── Floor slab ──
function FloorSlab({ width, depth, y, floorIndex, selected, isDragging, onPointerDown }: {
  width: number; depth: number; y: number; floorIndex: number;
  selected: boolean; isDragging: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const colors = ["#cbd5e1", "#bfdbfe", "#bbf7d0", "#fef08a", "#fecaca"];
  const baseColor = colors[floorIndex % colors.length];
  return (
    <mesh position={[width / 2, y - 0.05, depth / 2]} receiveShadow
      onPointerDown={onPointerDown}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}>
      <boxGeometry args={[width + 0.1, 0.1, depth + 0.1]} />
      <meshStandardMaterial
        color={isDragging ? "#3b82f6" : selected ? "#60a5fa" : hovered ? "#93c5fd" : baseColor}
        opacity={isDragging ? 0.6 : selected ? 0.6 : hovered ? 0.5 : 0.4}
        transparent
      />
    </mesh>
  );
}

// ── Roof Segment 3D ──
function RoofSegment3D({ segment, baseY, selected, isDragging, onPointerDown, onUpdate }: {
  segment: RoofSegment;
  baseY: number;
  selected: boolean;
  isDragging: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onUpdate: (updates: Partial<RoofSegment>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { type, pitchDegrees, rotation: rotDeg, x, z, width, depth } = segment;

  // Profile is always along width, extruded along depth, then rotated
  const roofHeight = calcRoofHeight(segment);
  const rotRad = (rotDeg * Math.PI) / 180;

  const cx = x + width / 2;
  const cz = z + depth / 2;

  const roofColor = isDragging ? "#b45309" : selected ? "#d97706" : hovered ? "#b45309" : "#92400e";
  const opacity = isDragging ? 0.5 : selected ? 0.85 : 0.7;

  if (type === "Flachdach") {
    return (
      <group>
        <mesh position={[cx, baseY + 0.1, cz]} rotation={[0, rotRad, 0]}
          onPointerDown={onPointerDown}
          onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
          <boxGeometry args={[width + 0.3, 0.2, depth + 0.3]} />
          <meshStandardMaterial color={roofColor} opacity={opacity} transparent />
        </mesh>
        {selected && (
          <Html position={[cx, baseY + 0.5, cz]} center>
            <div className="bg-amber-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
              {segment.name} · {width}×{depth}m · {rotDeg}°
            </div>
          </Html>
        )}
      </group>
    );
  }

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const hw = width / 2 + 0.15;
    s.moveTo(-hw, 0);
    s.lineTo(0, roofHeight);
    s.lineTo(hw, 0);
    s.lineTo(-hw, 0);
    return s;
  }, [width, roofHeight]);

  const extrudeSettings = useMemo(() => ({ depth: depth + 0.3, bevelEnabled: false }), [depth]);

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotRad, 0]}>
      <mesh position={[0, baseY, -depth / 2 - 0.15]}
        onPointerDown={onPointerDown}
        onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial color={roofColor} opacity={opacity} transparent side={THREE.DoubleSide} />
      </mesh>
      {/* Invisible click box */}
      <mesh position={[0, baseY + roofHeight / 2, 0]} visible={false}
        onPointerDown={onPointerDown}
        onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <boxGeometry args={[width, roofHeight, depth]} />
        <meshBasicMaterial />
      </mesh>
      {selected && (
        <Html position={[0, baseY + roofHeight + 0.3, 0]} center>
          <div className="bg-amber-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
            {segment.name} · {width}×{depth}m · {pitchDegrees}° · ↻{rotDeg}°
          </div>
        </Html>
      )}

      {/* Transform handles when selected */}
      {selected && !isDragging && (
        <RoofTransformHandles
          width={width} depth={depth} roofHeight={roofHeight} baseY={baseY}
          onUpdate={onUpdate}
        />
      )}
    </group>
  );
}

// ── Roof Transform Handles (resize corners + rotation ring) ──
function RoofTransformHandles({ width, depth, roofHeight, baseY, onUpdate }: {
  width: number; depth: number; roofHeight: number; baseY: number;
  onUpdate: (updates: Partial<RoofSegment>) => void;
}) {
  const handleSize = 0.2;
  const y = baseY + 0.1;

  // Corner/edge handles for resizing
  const resizeHandles: { id: string; pos: [number, number, number]; axis: "x" | "z" | "xz"; color: string }[] = [
    { id: "right", pos: [width / 2, y, 0], axis: "x", color: "#ef4444" },
    { id: "left", pos: [-width / 2, y, 0], axis: "x", color: "#ef4444" },
    { id: "front", pos: [0, y, depth / 2], axis: "z", color: "#3b82f6" },
    { id: "back", pos: [0, y, -depth / 2], axis: "z", color: "#3b82f6" },
    { id: "corner-rf", pos: [width / 2, y, depth / 2], axis: "xz", color: "#f59e0b" },
    { id: "corner-lb", pos: [-width / 2, y, -depth / 2], axis: "xz", color: "#f59e0b" },
    { id: "corner-rb", pos: [width / 2, y, -depth / 2], axis: "xz", color: "#f59e0b" },
    { id: "corner-lf", pos: [-width / 2, y, depth / 2], axis: "xz", color: "#f59e0b" },
  ];

  // Rotation handle — torus above the roof
  const rotY = baseY + roofHeight + 0.4;

  return (
    <group>
      {/* Resize handles */}
      {resizeHandles.map((h) => (
        <mesh key={h.id} position={h.pos}
          onPointerDown={(e) => {
            e.stopPropagation();
            const startX = e.point.x;
            const startZ = e.point.z;
            const startW = width;
            const startD = depth;

            const onMove = (ev: PointerEvent) => {
              const dx = (ev.clientX - (e.nativeEvent as PointerEvent).clientX) * 0.02;
              const dz = (ev.clientY - (e.nativeEvent as PointerEvent).clientY) * 0.02;
              if (h.axis === "x" || h.axis === "xz") {
                const sign = h.id.includes("left") || h.id.includes("lb") || h.id.includes("lf") ? -1 : 1;
                onUpdate({ width: Math.max(1, snapValue(startW + dx * sign)) });
              }
              if (h.axis === "z" || h.axis === "xz") {
                const sign = h.id.includes("back") || h.id.includes("lb") || h.id.includes("rb") ? 1 : -1;
                onUpdate({ depth: Math.max(1, snapValue(startD + dz * sign)) });
              }
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}>
          <boxGeometry args={[handleSize, handleSize, handleSize]} />
          <meshStandardMaterial color={h.color} />
        </mesh>
      ))}

      {/* Rotation handle — ring */}
      <mesh position={[0, rotY, 0]} rotation={[Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          const startClientX = (e.nativeEvent as PointerEvent).clientX;
          const startRot = 0;

          const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startClientX;
            const newRot = Math.round(dx * 0.5); // ~0.5 deg per pixel
            onUpdate({ rotation: ((startRot + newRot) % 360 + 360) % 360 });
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}>
        <torusGeometry args={[Math.max(width, depth) * 0.4, 0.06, 8, 32]} />
        <meshStandardMaterial color="#10b981" opacity={0.8} transparent />
      </mesh>
      {/* Rotation arrow indicator */}
      <mesh position={[Math.max(width, depth) * 0.4, rotY, 0]}>
        <coneGeometry args={[0.12, 0.25, 6]} />
        <meshStandardMaterial color="#10b981" />
      </mesh>
    </group>
  );
}

// ── Camera controller for top-down view ──
function CameraController({ topView, centerX, centerZ, viewHeight }: {
  topView: boolean;
  centerX: number;
  centerZ: number;
  viewHeight: number;
}) {
  const { camera } = useThree();
  const prevTopView = useRef(false);

  useEffect(() => {
    if (topView && !prevTopView.current) {
      camera.position.set(centerX, viewHeight, centerZ);
      camera.lookAt(centerX, 0, centerZ);
      (camera as THREE.PerspectiveCamera).fov = 50;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
    prevTopView.current = topView;
  }, [topView, centerX, centerZ, viewHeight, camera]);

  return null;
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
  activeFloorId,
  topView,
  snapGuides,
  dragRoomId,
  onSelectRoom,
  onRoomMoveTo,
  onDragStart,
  onDragEnd,
  onRoofUpdate,
}: {
  building: BuildingData;
  selectedRoom: string | null;
  exploded: boolean;
  activeFloorId: string | null;
  topView: boolean;
  snapGuides: { x: number[]; z: number[]; floorY: number; height: number } | null;
  dragRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onRoomMoveTo: (x: number, z: number) => void;
  onDragStart: (roomId: string, floorId: string, offsetX: number, offsetZ: number) => void;
  onDragEnd: () => void;
  onRoofUpdate: (roofId: string, updates: Partial<RoofSegment>) => void;
}) {
  const controlsRef = useRef<any>(null);
  const EXPLODE_GAP = 1.5;
  const bWidth = buildingWidth(building);
  const bDepth = buildingDepth(building);

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
  const centerX = bWidth / 2;
  const centerY = totalHeight / 2;
  const centerZ = bDepth / 2;

  // Disable orbit while dragging
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !dragRoomId;
    }
  }, [dragRoomId]);

  // Find floor Y for the drag plane
  const dragFloorY = useMemo(() => {
    if (!dragRoomId) return 0;
    if (dragRoomId.startsWith("roof:")) return totalHeight;
    // Floor slab drag — find the Y of this floor
    if (dragRoomId.startsWith("floor:")) {
      const floorId = dragRoomId.slice(6);
      for (const { floor, y } of floorPositions) {
        if (floor.id === floorId) return y;
      }
    }
    for (const { floor, y } of floorPositions) {
      if (floor.rooms.some((r) => r.id === dragRoomId)) return y;
    }
    return 0;
  }, [dragRoomId, floorPositions, totalHeight]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Ground — click to deselect */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.01, centerZ]} receiveShadow
        onPointerDown={() => { if (!dragRoomId) onSelectRoom(null); }}>
        <planeGeometry args={[bWidth + 12, bDepth + 12]} />
        <meshStandardMaterial color="#f1f5f9" opacity={0.5} transparent />
      </mesh>

      {/* Drag plane — large invisible plane at floor height for smooth dragging */}
      <DragPlane
        active={!!dragRoomId}
        floorY={dragFloorY}
        onMove={(point) => onRoomMoveTo(point.x, point.z)}
        onUp={onDragEnd}
      />

      <Grid args={[40, 40]} position={[centerX, 0, centerZ]}
        cellSize={1} cellThickness={0.5} cellColor="#e2e8f0"
        sectionSize={5} sectionThickness={1} sectionColor="#cbd5e1"
        fadeDistance={40} infiniteGrid={false} />

      <BuildingOutline width={bWidth} depth={bDepth} />

      <DimensionLine start={[0, 0, bDepth + 0.5]} end={[bWidth, 0, bDepth + 0.5]} offset={[0, 0, 0]} label={`${bWidth.toFixed(2)} m`} />
      <DimensionLine start={[bWidth + 0.5, 0, 0]} end={[bWidth + 0.5, 0, bDepth]} offset={[0, 0, 0]} label={`${bDepth.toFixed(2)} m`} />

      {floorPositions.map(({ floor, y, index }) => {
        const isActive = !activeFloorId || activeFloorId === floor.id;
        const isGhost = activeFloorId && activeFloorId !== floor.id;
        const fx = floor.x || 0;
        const fz = floor.z || 0;

        return (
          <group key={floor.id} position={[fx, 0, fz]}>
            <FloorSlab width={floor.width} depth={floor.depth} y={y} floorIndex={index}
              selected={selectedRoom === `floor:${floor.id}`}
              isDragging={dragRoomId === `floor:${floor.id}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectRoom(`floor:${floor.id}`);
                onDragStart(`floor:${floor.id}`, floor.id, e.point.x - fx, e.point.z - fz);
              }}
            />

            {isActive && floor.rooms.map((room) => (
              <Room3D
                key={room.id}
                room={room}
                floorY={y}
                ceilingHeight={floor.ceilingHeight}
                selected={selectedRoom === room.id}
                isDragging={dragRoomId === room.id}
                isVoid={room.isVoid}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectRoom(room.id);
                  const offsetX = e.point.x - room.x - fx;
                  const offsetZ = e.point.z - room.z - fz;
                  onDragStart(room.id, floor.id, offsetX, offsetZ);
                }}
              />
            ))}

            {isGhost && (
              <mesh position={[floor.width / 2, y + floor.ceilingHeight / 2, floor.depth / 2]}>
                <boxGeometry args={[floor.width, floor.ceilingHeight * 0.9, floor.depth]} />
                <meshStandardMaterial color="#94a3b8" opacity={0.08} transparent side={THREE.DoubleSide} />
              </mesh>
            )}

            <Text position={[-0.8, y + floor.ceilingHeight / 2, centerZ - fz]} fontSize={0.35} color={isActive ? "#1e3a5f" : "#94a3b8"} anchorX="right" anchorY="middle" fontWeight="bold">
              {floor.name}
            </Text>
            {isActive && (
              <Text position={[bWidth - fx + 1.2, y + floor.ceilingHeight / 2, centerZ - fz]} fontSize={0.2} color="#dc2626" anchorX="left" anchorY="middle">
                {floor.ceilingHeight.toFixed(2)} m
              </Text>
            )}
          </group>
        );
      })}

      {snapGuides && (
        <SnapGuides guidesX={snapGuides.x} guidesZ={snapGuides.z}
          buildingWidth={bWidth} buildingDepth={bDepth}
          floorY={snapGuides.floorY} height={snapGuides.height} />
      )}

      {!activeFloorId && building.roofSegments.map((seg) => (
        <RoofSegment3D
          key={seg.id}
          segment={seg}
          baseY={totalHeight}
          selected={selectedRoom === `roof:${seg.id}`}
          isDragging={dragRoomId === `roof:${seg.id}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelectRoom(`roof:${seg.id}`);
            onDragStart(`roof:${seg.id}`, "", e.point.x - seg.x, e.point.z - seg.z);
          }}
          onUpdate={(updates) => onRoofUpdate(seg.id, updates)}
        />
      ))}

      <CameraController topView={topView} centerX={centerX} centerZ={centerZ}
        viewHeight={Math.max(bWidth, bDepth) * 1.2 + totalHeight} />

      <OrbitControls ref={controlsRef}
        target={[centerX, topView ? 0 : centerY, centerZ]}
        maxPolarAngle={topView ? 0.01 : Math.PI * 0.85}
        minPolarAngle={topView ? 0 : 0}
        enableRotate={!topView}
        minDistance={3} maxDistance={80}
        enableDamping dampingFactor={0.05}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }} />
    </>
  );
}

// ── Side Panel ──
function SidePanel({
  building,
  selectedRoom,
  activeFloorId,
  onChange,
  onSelectRoom,
  onSetActiveFloor,
  onDuplicateRoom,
}: {
  building: BuildingData;
  selectedRoom: string | null;
  activeFloorId: string | null;
  onChange: (b: BuildingData) => void;
  onSelectRoom: (id: string | null) => void;
  onSetActiveFloor: (id: string | null) => void;
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
      newX = maxRight < floor.width - 2 ? maxRight : 0;
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

  const bWidth = buildingWidth(building);
  const bDepth = buildingDepth(building);
  const sortedFloors = [...building.floors].sort((a, b) => b.level - a.level);

  return (
    <div className="w-80 bg-white border-l overflow-y-auto flex flex-col">
      {/* Building summary */}
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm text-gray-800 mb-1">Gebäude</h3>
        <div className="text-xs text-gray-500">Max: {bWidth.toFixed(1)} × {bDepth.toFixed(1)} m</div>
      </div>

      {/* Roof segments */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-gray-800">Dächer</h3>
          <button
            onClick={() => onChange({ ...building, roofSegments: [...building.roofSegments, createRoofSegment({ name: `Dach ${building.roofSegments.length + 1}`, width: 4, depth: 4, x: 0, z: 0 })] })}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            + Dach
          </button>
        </div>
        <div className="space-y-2">
          {building.roofSegments.map((seg, i) => (
            <div key={seg.id} className="bg-gray-50 rounded-lg p-2 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <input
                  value={seg.name}
                  onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, name: e.target.value } : s) })}
                  className="font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none flex-1"
                />
                {building.roofSegments.length > 1 && (
                  <button onClick={() => onChange({ ...building, roofSegments: building.roofSegments.filter((s) => s.id !== seg.id) })} className="text-red-400 hover:text-red-600 ml-1 p-0.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1">
                <select
                  value={seg.type}
                  onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, type: e.target.value as RoofType } : s) })}
                  className="col-span-2 border rounded px-1 py-0.5 bg-white"
                >
                  <option value="Satteldach">Sattel</option>
                  <option value="Flachdach">Flach</option>
                  <option value="Walmdach">Walm</option>
                  <option value="Pultdach">Pult</option>
                </select>
                {seg.type !== "Flachdach" && (
                  <>
                    <input type="number" step="1" min="5" max="80" value={seg.pitchDegrees} onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, pitchDegrees: +e.target.value || 35, height: undefined } : s) })} className="border rounded px-1 py-0.5 text-right" title="Neigung °" />
                    <input type="number" step="5" min="0" max="360" value={seg.rotation} onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, rotation: +e.target.value || 0 } : s) })} className="border rounded px-1 py-0.5 text-right" title="Rotation °" />
                  </>
                )}
              </div>
              {seg.type !== "Flachdach" && (
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">H:</span>
                  <input type="number" step="0.1" min="0.5" value={+(calcRoofHeight(seg).toFixed(2))}
                    onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, height: +e.target.value || 1 } : s) })}
                    className="flex-1 border rounded px-1 py-0.5 text-right" title="Dachhöhe (m)" />
                </div>
                <span className="text-[10px] text-gray-400 self-center">= {calcRoofHeight(seg).toFixed(2)} m</span>
              </div>
              )}
              </div>
              <div className="grid grid-cols-4 gap-1">
                <input type="number" step="0.1" value={seg.x} onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, x: +e.target.value } : s) })} className="border rounded px-1 py-0.5 text-right" title="X" />
                <input type="number" step="0.1" value={seg.z} onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, z: +e.target.value } : s) })} className="border rounded px-1 py-0.5 text-right" title="Z" />
                <input type="number" step="0.1" value={seg.width} onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, width: +e.target.value || 1 } : s) })} className="border rounded px-1 py-0.5 text-right" title="Breite" />
                <input type="number" step="0.1" value={seg.depth} onChange={(e) => onChange({ ...building, roofSegments: building.roofSegments.map((s) => s.id === seg.id ? { ...s, depth: +e.target.value || 1 } : s) })} className="border rounded px-1 py-0.5 text-right" title="Tiefe" />
              </div>
              <div className="flex gap-1 text-[10px] text-gray-400">
                <span className="flex-1 text-center">X</span>
                <span className="flex-1 text-center">Z</span>
                <span className="flex-1 text-center">B</span>
                <span className="flex-1 text-center">T</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floor tabs */}
      <div className="flex border-b overflow-x-auto">
        <button
          onClick={() => onSetActiveFloor(null)}
          className={`flex-shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            !activeFloorId ? "border-blue-500 text-blue-700 bg-blue-50" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Alle
        </button>
        {sortedFloors.map((floor) => (
          <button
            key={floor.id}
            onClick={() => onSetActiveFloor(floor.id)}
            className={`flex-shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeFloorId === floor.id ? "border-blue-500 text-blue-700 bg-blue-50" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {floor.name}
          </button>
        ))}
      </div>

      {/* Floors */}
      <div className="flex-1 overflow-y-auto">
        {sortedFloors.filter((f) => !activeFloorId || f.id === activeFloorId).map((floor) => (
          <div key={floor.id} className="border-b">
            <div className="flex items-center justify-between p-3 bg-gray-50">
              <div className="flex-1 min-w-0">
                <input
                  value={floor.name}
                  onChange={(e) => updateFloor(floor.id, { name: e.target.value })}
                  className="font-medium text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full"
                />
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                  <span>H:</span>
                  <input type="number" step="0.1" min="2" max="5" value={floor.ceilingHeight}
                    onChange={(e) => updateFloor(floor.id, { ceilingHeight: +e.target.value || 2.5 })}
                    className="w-12 border rounded px-1 py-0.5 text-right bg-white" />
                  <span>B:</span>
                  <input type="number" step="0.1" min="1" value={floor.width}
                    onChange={(e) => updateFloor(floor.id, { width: +e.target.value || 1 })}
                    className="w-12 border rounded px-1 py-0.5 text-right bg-white" />
                  <span>T:</span>
                  <input type="number" step="0.1" min="1" value={floor.depth}
                    onChange={(e) => updateFloor(floor.id, { depth: +e.target.value || 1 })}
                    className="w-12 border rounded px-1 py-0.5 text-right bg-white" />
                  <span>X:</span>
                  <input type="number" step="0.1" value={floor.x || 0}
                    onChange={(e) => updateFloor(floor.id, { x: +e.target.value })}
                    className="w-12 border rounded px-1 py-0.5 text-right bg-white" title="X-Offset" />
                  <span>Z:</span>
                  <input type="number" step="0.1" value={floor.z || 0}
                    onChange={(e) => updateFloor(floor.id, { z: +e.target.value })}
                    className="w-12 border rounded px-1 py-0.5 text-right bg-white" title="Z-Offset" />
                  <span>{floor.rooms.length} R · {floor.rooms.reduce((s, r) => s + roomArea(r), 0).toFixed(1)} m²</span>
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
                    <span className={`font-medium ${room.isVoid ? "text-red-500 line-through" : "text-gray-800"}`}>{room.name}</span>
                    <span className="flex items-center gap-1">
                      {room.isVoid && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">Void</span>}
                      <span className="text-xs text-gray-500">{roomArea(room).toFixed(1)} m²</span>
                    </span>
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRoomData.isVoid}
                onChange={(e) => updateRoom(selectedRoomData!.id, selectedFloor!.id, { isVoid: e.target.checked })}
                className="rounded border-gray-300 text-red-500 focus:ring-red-500"
              />
              <span className="text-xs text-gray-600">Negativraum (Void)</span>
            </label>
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
  const [topView, setTopView] = useState(false);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number[]; z: number[]; floorY: number; height: number } | null>(null);
  const { current: historyBuilding, push: pushHistory, undo, redo, canUndo, canRedo } = useHistory(building);
  const bWidth = buildingWidth(building);
  const bDepth = buildingDepth(building);

  // Drag state: track which room is being dragged, offset from click to room origin
  const [dragRoomId, setDragRoomId] = useState<string | null>(null);
  const dragInfo = useRef<{ floorId: string; offsetX: number; offsetZ: number } | null>(null);

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

  // Called when user clicks a room
  const handleDragStart = useCallback(
    (roomId: string, floorId: string, offsetX: number, offsetZ: number) => {
      setDragRoomId(roomId);
      dragInfo.current = { floorId, offsetX, offsetZ };
    },
    []
  );

  // Called continuously as mouse moves over the drag plane
  const handleRoomMoveTo = useCallback(
    (worldX: number, worldZ: number) => {
      if (!dragInfo.current || !dragRoomId) return;
      const { floorId, offsetX, offsetZ } = dragInfo.current;

      const rawX = worldX - offsetX;
      const rawZ = worldZ - offsetZ;

      // Dragging a floor slab — snap to other floor edges
      if (dragRoomId.startsWith("floor:")) {
        const fId = dragRoomId.slice(6);
        const thisFloor = building.floors.find((f) => f.id === fId);
        if (!thisFloor) return;

        let sx = snapValue(rawX);
        let sz = snapValue(rawZ);
        const gx: number[] = [];
        const gz: number[] = [];
        const threshold = 0.3;

        // Snap to origin
        if (Math.abs(sx) < threshold) { sx = 0; gx.push(0); }
        if (Math.abs(sz) < threshold) { sz = 0; gz.push(0); }

        // Snap to other floors' edges
        for (const other of building.floors) {
          if (other.id === fId) continue;
          const ox = other.x || 0;
          const oz = other.z || 0;

          // X edges: left-to-left, left-to-right, right-to-left, right-to-right
          const edgesX = [ox, ox + other.width];
          const myEdgesX = [sx, sx + thisFloor.width];
          for (const e of edgesX) {
            for (const m of myEdgesX) {
              if (Math.abs(m - e) < threshold) {
                sx += e - m;
                gx.push(e);
              }
            }
          }
          // Z edges
          const edgesZ = [oz, oz + other.depth];
          const myEdgesZ = [sz, sz + thisFloor.depth];
          for (const e of edgesZ) {
            for (const m of myEdgesZ) {
              if (Math.abs(m - e) < threshold) {
                sz += e - m;
                gz.push(e);
              }
            }
          }
        }

        setSnapGuides({
          x: gx,
          z: gz,
          floorY: building.floors.sort((a, b) => a.level - b.level).reduce((y, f) => f.id === fId ? y : y + f.ceilingHeight, 0),
          height: thisFloor.ceilingHeight,
        });

        onChange({
          ...building,
          floors: building.floors.map((f) =>
            f.id === fId ? { ...f, x: sx, z: sz } : f
          ),
        });
        return;
      }

      // Dragging a roof segment — snap to floor edges and other roofs
      if (dragRoomId.startsWith("roof:")) {
        const roofId = dragRoomId.slice(5);
        const seg = building.roofSegments.find((s) => s.id === roofId);
        if (!seg) return;

        let sx = snapValue(rawX);
        let sz = snapValue(rawZ);
        const gx: number[] = [];
        const gz: number[] = [];
        const threshold = 0.3;

        // Snap to origin
        if (Math.abs(sx) < threshold) { sx = 0; gx.push(0); }
        if (Math.abs(sz) < threshold) { sz = 0; gz.push(0); }

        // Collect all edges: floors + other roofs
        const allEdgesX: number[] = [];
        const allEdgesZ: number[] = [];
        for (const f of building.floors) {
          const fx = f.x || 0;
          const fz = f.z || 0;
          allEdgesX.push(fx, fx + f.width);
          allEdgesZ.push(fz, fz + f.depth);
        }
        for (const other of building.roofSegments) {
          if (other.id === roofId) continue;
          allEdgesX.push(other.x, other.x + other.width);
          allEdgesZ.push(other.z, other.z + other.depth);
        }

        const myEdgesX = [sx, sx + seg.width];
        const myEdgesZ = [sz, sz + seg.depth];
        for (const e of allEdgesX) {
          for (const m of myEdgesX) {
            if (Math.abs(m - e) < threshold) { sx += e - m; gx.push(e); }
          }
        }
        for (const e of allEdgesZ) {
          for (const m of myEdgesZ) {
            if (Math.abs(m - e) < threshold) { sz += e - m; gz.push(e); }
          }
        }

        const totalH = building.floors.reduce((s, f) => s + f.ceilingHeight, 0);
        setSnapGuides({ x: gx, z: gz, floorY: totalH, height: 1 });

        onChange({
          ...building,
          roofSegments: building.roofSegments.map((s) =>
            s.id === roofId ? { ...s, x: sx, z: sz } : s
          ),
        });
        return;
      }

      // Dragging a room — subtract floor offset since rooms are relative to floor
      const floor = building.floors.find((f) => f.id === floorId);
      const room = floor?.rooms.find((r) => r.id === dragRoomId);
      if (!room || !floor) return;

      const floorRelX = rawX - (floor.x || 0);
      const floorRelZ = rawZ - (floor.z || 0);

      const otherRooms = floor.rooms.filter((r) => r.id !== dragRoomId);
      const snapped = snapWithGuides(floorRelX, floorRelZ, room.width, room.depth, floor.width, floor.depth, otherRooms);

      setSnapGuides({
        x: snapped.guidesX,
        z: snapped.guidesZ,
        floorY: building.floors.sort((a, b) => a.level - b.level).reduce((y, f) => f.id === floorId ? y : y + f.ceilingHeight, 0),
        height: floor.ceilingHeight,
      });

      const clampedX = Math.max(0, Math.min(snapped.x, floor.width - room.width));
      const clampedZ = Math.max(0, Math.min(snapped.z, floor.depth - room.depth));

      onChange({
        ...building,
        floors: building.floors.map((f) =>
          f.id === floorId
            ? { ...f, rooms: f.rooms.map((r) => (r.id === dragRoomId ? { ...r, x: clampedX, z: clampedZ } : r)) }
            : f
        ),
      });
    },
    [building, onChange, dragRoomId]
  );

  const handleDragEnd = useCallback(() => {
    setDragRoomId(null);
    dragInfo.current = null;
    setSnapGuides(null);
    pushHistory(building);
  }, [building, pushHistory]);

  const handleDuplicateRoom = useCallback(
    (roomId: string, floorId: string) => {
      const floor = building.floors.find((f) => f.id === floorId);
      const room = floor?.rooms.find((r) => r.id === roomId);
      if (!room) return;
      const floorW = floor?.width ?? bWidth;
      const floorD = floor?.depth ?? bDepth;
      const newRoom = createRoom({
        ...room,
        id: undefined as unknown as string,
        name: room.name + " (Kopie)",
        x: Math.min(room.x + 0.5, floorW - room.width),
        z: Math.min(room.z + 0.5, floorD - room.depth),
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
        // Delete roof segment
        if (selectedRoom.startsWith("roof:")) {
          const roofId = selectedRoom.slice(5);
          setSelectedRoom(null);
          updateBuilding({
            ...building,
            roofSegments: building.roofSegments.filter((s) => s.id !== roofId),
          });
        } else {
          // Delete room
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

      // Arrow keys to nudge selected item
      if (selectedRoom && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : 0.05;

        // Nudge floor slab
        if (selectedRoom.startsWith("floor:")) {
          const fId = selectedRoom.slice(6);
          const floor = building.floors.find((f) => f.id === fId);
          if (floor) {
            let x = floor.x || 0;
            let z = floor.z || 0;
            if (e.key === "ArrowLeft") x -= step;
            if (e.key === "ArrowRight") x += step;
            if (e.key === "ArrowUp") z -= step;
            if (e.key === "ArrowDown") z += step;
            updateBuilding({
              ...building,
              floors: building.floors.map((f) =>
                f.id === fId ? { ...f, x: snapValue(x), z: snapValue(z) } : f
              ),
            });
          }
          return;
        }

        // Nudge roof segment
        if (selectedRoom.startsWith("roof:")) {
          const roofId = selectedRoom.slice(5);
          const seg = building.roofSegments.find((s) => s.id === roofId);
          if (seg) {
            let { x, z } = seg;
            if (e.key === "ArrowLeft") x -= step;
            if (e.key === "ArrowRight") x += step;
            if (e.key === "ArrowUp") z -= step;
            if (e.key === "ArrowDown") z += step;
            updateBuilding({
              ...building,
              roofSegments: building.roofSegments.map((s) =>
                s.id === roofId ? { ...s, x: snapValue(x), z: snapValue(z) } : s
              ),
            });
          }
        } else {
          // Nudge room
          for (const floor of building.floors) {
            const room = floor.rooms.find((r) => r.id === selectedRoom);
            if (room) {
              let { x, z } = room;
              if (e.key === "ArrowLeft") x = Math.max(0, x - step);
              if (e.key === "ArrowRight") x = Math.min(floor.width - room.width, x + step);
              if (e.key === "ArrowUp") z = Math.max(0, z - step);
              if (e.key === "ArrowDown") z = Math.min(floor.depth - room.depth, z + step);
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
            position: [bWidth * 1.8, totalHeight * 1.5, bDepth * 1.8],
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
            activeFloorId={activeFloorId}
            topView={topView}
            snapGuides={snapGuides}
            dragRoomId={dragRoomId}
            onSelectRoom={setSelectedRoom}
            onRoomMoveTo={handleRoomMoveTo}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onRoofUpdate={(roofId, updates) => {
              onChange({
                ...building,
                roofSegments: building.roofSegments.map((s) =>
                  s.id === roofId ? { ...s, ...updates } : s
                ),
              });
            }}
          />
        </Canvas>

        {/* Toolbar */}
        <div className="absolute top-4 left-4 flex gap-2">
          <button onClick={() => setExploded(!exploded)}
            className={`px-3 py-1.5 text-xs rounded-lg border shadow-sm transition-colors ${exploded ? "bg-blue-600 border-blue-700 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {exploded ? "Zusammenklappen" : "Explosionsansicht"}
          </button>
          <button onClick={() => setTopView(!topView)}
            className={`px-3 py-1.5 text-xs rounded-lg border shadow-sm transition-colors ${topView ? "bg-blue-600 border-blue-700 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {topView ? "3D-Ansicht" : "Draufsicht"}
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
          <div><kbd className="bg-gray-100 px-1 rounded">LMB</kbd> Raum greifen · <kbd className="bg-gray-100 px-1 rounded">MMB</kbd> Drehen · <kbd className="bg-gray-100 px-1 rounded">Scroll</kbd> Zoom</div>
          <div><kbd className="bg-gray-100 px-1 rounded">Pfeiltasten</kbd> Raum bewegen · <kbd className="bg-gray-100 px-1 rounded">Shift</kbd> größere Schritte</div>
          <div><kbd className="bg-gray-100 px-1 rounded">Del</kbd> Löschen · <kbd className="bg-gray-100 px-1 rounded">Esc</kbd> Abwählen · <kbd className="bg-gray-100 px-1 rounded">Ctrl+Z</kbd> Rückgängig</div>
        </div>
      </div>

      <SidePanel
        building={building}
        selectedRoom={selectedRoom}
        activeFloorId={activeFloorId}
        onChange={updateBuilding}
        onSelectRoom={setSelectedRoom}
        onSetActiveFloor={setActiveFloorId}
        onDuplicateRoom={handleDuplicateRoom}
      />
    </div>
  );
}
