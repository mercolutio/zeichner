"use client";

import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { FloorplanAnalysis, Floor, Room } from "@/types/floorplan";

interface Building3DProps {
  analysis: FloorplanAnalysis;
}

// Colors for floors
const FLOOR_COLORS = [
  "#94a3b8", // KG - slate
  "#bfdbfe", // EG - blue
  "#bbf7d0", // OG1 - green
  "#fef08a", // OG2 - yellow
  "#fecaca", // DG - red
];

const WALL_COLOR = "#e2e8f0";
const ROOF_COLOR = "#92400e";

function RoomMesh({
  room,
  floorY,
  floorHeight,
  floorIndex,
  floorOffsetX,
  floorOffsetZ,
}: {
  room: Room;
  floorY: number;
  floorHeight: number;
  floorIndex: number;
  floorOffsetX: number;
  floorOffsetZ: number;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  const wallHeight = floorHeight * 0.95;
  const wallThickness = 0.08;
  const color = FLOOR_COLORS[floorIndex % FLOOR_COLORS.length];

  // Room position (centered)
  const x = floorOffsetX + room.width / 2;
  const z = floorOffsetZ + room.length / 2;

  return (
    <group position={[x, floorY, z]}>
      {/* Floor slab */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[room.width, 0.04, room.length]} />
        <meshStandardMaterial color={color} opacity={0.6} transparent />
      </mesh>

      {/* Walls - 4 sides */}
      {/* Front wall */}
      <mesh position={[0, wallHeight / 2, room.length / 2 - wallThickness / 2]}>
        <boxGeometry args={[room.width, wallHeight, wallThickness]} />
        <meshStandardMaterial
          color={hovered ? "#3b82f6" : WALL_COLOR}
          opacity={hovered ? 0.5 : 0.25}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, wallHeight / 2, -room.length / 2 + wallThickness / 2]}>
        <boxGeometry args={[room.width, wallHeight, wallThickness]} />
        <meshStandardMaterial
          color={hovered ? "#3b82f6" : WALL_COLOR}
          opacity={hovered ? 0.5 : 0.25}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Left wall */}
      <mesh position={[-room.width / 2 + wallThickness / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, room.length]} />
        <meshStandardMaterial
          color={hovered ? "#3b82f6" : WALL_COLOR}
          opacity={hovered ? 0.5 : 0.25}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Right wall */}
      <mesh position={[room.width / 2 - wallThickness / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, room.length]} />
        <meshStandardMaterial
          color={hovered ? "#3b82f6" : WALL_COLOR}
          opacity={hovered ? 0.5 : 0.25}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Hover area (invisible) */}
      <mesh
        ref={meshRef}
        position={[0, wallHeight / 2, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[room.width - 0.1, wallHeight, room.length - 0.1]} />
        <meshStandardMaterial transparent opacity={0} />
      </mesh>

      {/* Room label */}
      {hovered && (
        <Html position={[0, wallHeight + 0.3, 0]} center>
          <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
            <strong>{room.name}</strong>
            <br />
            {room.width.toFixed(2)} × {room.length.toFixed(2)} m
            <br />
            {room.area.toFixed(2)} m²
          </div>
        </Html>
      )}

      {/* Room name text on floor */}
      <Text
        position={[0, 0.06, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.min(room.width, room.length) * 0.15}
        color="#374151"
        anchorX="center"
        anchorY="middle"
        maxWidth={room.width * 0.9}
      >
        {room.name}
      </Text>
    </group>
  );
}

function FloorMesh({
  floor,
  floorY,
  floorIndex,
  buildingWidth,
  buildingDepth,
}: {
  floor: Floor;
  floorY: number;
  floorIndex: number;
  buildingWidth: number;
  buildingDepth: number;
}) {
  // Layout rooms in a grid-like arrangement
  const roomLayouts = useMemo(() => {
    const layouts: { room: Room; x: number; z: number }[] = [];
    // Sort rooms: larger first
    const sorted = [...floor.rooms].sort((a, b) => b.area - a.area);

    // Simple row-based layout
    let curX = 0;
    let curZ = 0;
    let rowHeight = 0;

    for (const room of sorted) {
      if (curX + room.width > buildingWidth + 0.5 && curX > 0) {
        curX = 0;
        curZ += rowHeight + 0.1;
        rowHeight = 0;
      }
      layouts.push({ room, x: curX, z: curZ });
      curX += room.width + 0.1;
      rowHeight = Math.max(rowHeight, room.length);
    }

    return layouts;
  }, [floor.rooms, buildingWidth]);

  return (
    <group>
      {/* Floor base plate */}
      <mesh position={[buildingWidth / 2, floorY - 0.05, buildingDepth / 2]} receiveShadow>
        <boxGeometry args={[buildingWidth + 0.2, 0.1, buildingDepth + 0.2]} />
        <meshStandardMaterial
          color={FLOOR_COLORS[floorIndex % FLOOR_COLORS.length]}
          opacity={0.3}
          transparent
        />
      </mesh>

      {/* Floor outline */}
      <lineSegments position={[buildingWidth / 2, floorY, buildingDepth / 2]}>
        <edgesGeometry args={[new THREE.BoxGeometry(buildingWidth, 0.02, buildingDepth)]} />
        <lineBasicMaterial color="#64748b" />
      </lineSegments>

      {/* Rooms */}
      {roomLayouts.map((rl, i) => (
        <RoomMesh
          key={i}
          room={rl.room}
          floorY={floorY}
          floorHeight={floor.ceilingHeight}
          floorIndex={floorIndex}
          floorOffsetX={rl.x}
          floorOffsetZ={rl.z}
        />
      ))}

      {/* Floor label */}
      <Text
        position={[-0.5, floorY + floor.ceilingHeight / 2, buildingDepth / 2]}
        fontSize={0.3}
        color="#1e3a5f"
        anchorX="right"
        anchorY="middle"
        fontWeight="bold"
      >
        {floor.name}
      </Text>
    </group>
  );
}

function RoofMesh({
  buildingWidth,
  buildingDepth,
  roofBaseY,
  roofType,
  roofPitch,
}: {
  buildingWidth: number;
  buildingDepth: number;
  roofBaseY: number;
  roofType: string;
  roofPitch: number;
}) {
  const roofHeight =
    roofType === "Flachdach"
      ? 0.2
      : (buildingWidth / 2) * Math.tan((roofPitch * Math.PI) / 180);

  if (roofType === "Flachdach") {
    return (
      <mesh position={[buildingWidth / 2, roofBaseY + 0.1, buildingDepth / 2]}>
        <boxGeometry args={[buildingWidth + 0.4, 0.2, buildingDepth + 0.4]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
    );
  }

  // Gable roof (Satteldach)
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const hw = buildingWidth / 2 + 0.2;
    s.moveTo(-hw, 0);
    s.lineTo(0, roofHeight);
    s.lineTo(hw, 0);
    s.lineTo(-hw, 0);
    return s;
  }, [buildingWidth, roofHeight]);

  const extrudeSettings = useMemo(
    () => ({
      depth: buildingDepth + 0.4,
      bevelEnabled: false,
    }),
    [buildingDepth]
  );

  return (
    <mesh
      position={[buildingWidth / 2, roofBaseY, -0.2]}
      rotation={[0, 0, 0]}
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color={ROOF_COLOR} opacity={0.7} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

function Scene({ analysis }: { analysis: FloorplanAnalysis }) {
  const { floors, buildingWidth, buildingDepth, roofType, roofPitchDegrees } =
    analysis;
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);

  // Calculate floor Y positions
  let currentY = 0;
  const floorPositions = sortedFloors.map((floor, i) => {
    const y = currentY;
    currentY += floor.ceilingHeight;
    return { floor, y, index: i };
  });

  const totalHeight = currentY;
  const roofBaseY = totalHeight;

  // Center camera target
  const centerX = buildingWidth / 2;
  const centerY = totalHeight / 2;
  const centerZ = buildingDepth / 2;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Ground plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, -0.01, centerZ]}
        receiveShadow
      >
        <planeGeometry args={[buildingWidth + 6, buildingDepth + 6]} />
        <meshStandardMaterial color="#d1d5db" opacity={0.3} transparent />
      </mesh>

      {/* Grid */}
      <gridHelper
        args={[Math.max(buildingWidth, buildingDepth) + 4, 20, "#e5e7eb", "#f3f4f6"]}
        position={[centerX, 0, centerZ]}
      />

      {/* Floors */}
      {floorPositions.map(({ floor, y, index }) => (
        <FloorMesh
          key={index}
          floor={floor}
          floorY={y}
          floorIndex={index}
          buildingWidth={buildingWidth}
          buildingDepth={buildingDepth}
        />
      ))}

      {/* Roof */}
      <RoofMesh
        buildingWidth={buildingWidth}
        buildingDepth={buildingDepth}
        roofBaseY={roofBaseY}
        roofType={roofType}
        roofPitch={roofPitchDegrees || 35}
      />

      {/* Camera controls */}
      <OrbitControls
        target={[centerX, centerY, centerZ]}
        maxPolarAngle={Math.PI / 2}
        minDistance={3}
        maxDistance={50}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

export default function Building3D({ analysis }: Building3DProps) {
  const [exploded, setExploded] = useState(false);

  // Create exploded view by adding Y-offset between floors
  const explodedAnalysis = useMemo(() => {
    if (!exploded) return analysis;
    const newFloors = analysis.floors.map((floor, i) => ({
      ...floor,
      ceilingHeight: floor.ceilingHeight + 1.5, // Add gap
    }));
    return { ...analysis, floors: newFloors };
  }, [analysis, exploded]);

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">3D-Ansicht</h3>
          <p className="text-xs text-gray-500">
            Ziehen zum Drehen · Scrollen zum Zoomen · Shift+Ziehen zum Verschieben
          </p>
        </div>
        <button
          onClick={() => setExploded(!exploded)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            exploded
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
          }`}
        >
          {exploded ? "Zusammenklappen" : "Explodierte Ansicht"}
        </button>
      </div>
      <div style={{ height: "500px" }}>
        <Canvas
          camera={{
            position: [
              analysis.buildingWidth * 1.5,
              analysis.floors.reduce((s, f) => s + f.ceilingHeight, 0) * 1.2,
              analysis.buildingDepth * 1.5,
            ],
            fov: 50,
            near: 0.1,
            far: 200,
          }}
          shadows
        >
          <Scene analysis={explodedAnalysis} />
        </Canvas>
      </div>
      {/* Legend */}
      <div className="px-5 py-3 border-t flex flex-wrap gap-3 text-xs">
        {analysis.floors
          .sort((a, b) => a.level - b.level)
          .map((floor, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{
                  backgroundColor: FLOOR_COLORS[i % FLOOR_COLORS.length],
                }}
              />
              <span className="text-gray-600">{floor.name}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
