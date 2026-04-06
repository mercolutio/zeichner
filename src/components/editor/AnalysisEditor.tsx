"use client";

import { useState } from "react";
import { FloorplanAnalysis, Floor, Room, RoomCategory, RoofType, CrossSectionLayout, CrossSectionFloor, CrossSectionRoom } from "@/types/floorplan";
import FloorPlanCanvas from "./FloorPlanCanvas";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
} from "lucide-react";

interface AnalysisEditorProps {
  initial: FloorplanAnalysis;
  onConfirm: (edited: FloorplanAnalysis) => void;
}

const ROOM_CATEGORIES: { value: RoomCategory; label: string }[] = [
  { value: "wohnraum", label: "Wohnraum" },
  { value: "nutzraum", label: "Nutzraum" },
  { value: "balkon", label: "Balkon" },
  { value: "terrasse", label: "Terrasse" },
  { value: "loggia", label: "Loggia" },
  { value: "keller", label: "Keller" },
  { value: "garage", label: "Garage" },
];

const ROOF_TYPES: RoofType[] = ["Satteldach", "Flachdach", "Walmdach", "Pultdach"];

function NumberInput({
  value,
  onChange,
  step = 0.01,
  min = 0,
  suffix,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        min={min}
        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {suffix}
        </span>
      )}
    </div>
  );
}

function RoomEditor({
  room,
  onChange,
  onRemove,
}: {
  room: Room;
  onChange: (room: Room) => void;
  onRemove: () => void;
}) {
  const update = (partial: Partial<Room>) => onChange({ ...room, ...partial });

  return (
    <div className="grid grid-cols-[1fr_120px_80px_80px_80px_100px_36px] gap-2 items-center">
      <input
        type="text"
        value={room.name}
        onChange={(e) => update({ name: e.target.value })}
        className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        placeholder="Raumname"
      />
      <select
        value={room.category}
        onChange={(e) => update({ category: e.target.value as RoomCategory })}
        className="px-2 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
      >
        {ROOM_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <NumberInput
        value={room.width}
        onChange={(v) => update({ width: v, area: v * room.length })}
        suffix="m"
      />
      <NumberInput
        value={room.length}
        onChange={(v) => update({ length: v, area: room.width * v })}
        suffix="m"
      />
      <div className="px-3 py-2 bg-gray-50 border rounded-lg text-sm text-right text-gray-700">
        {room.area.toFixed(2)}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={room.hasSlope}
          onChange={(e) =>
            update({
              hasSlope: e.target.checked,
              slopeDetails: e.target.checked
                ? {
                    minHeight: 0.5,
                    maxHeight: room.width > 0 ? 2.5 : 2.5,
                    areaBelow1m: room.area * 0.1,
                    areaBetween1and2m: room.area * 0.3,
                    areaAbove2m: room.area * 0.6,
                  }
                : undefined,
            })
          }
          className="rounded border-gray-300"
        />
        Schräge
      </label>
      <button
        onClick={onRemove}
        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
        title="Raum entfernen"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function SlopeEditor({
  room,
  onChange,
}: {
  room: Room;
  onChange: (room: Room) => void;
}) {
  if (!room.hasSlope || !room.slopeDetails) return null;

  const updateSlope = (partial: Partial<Room["slopeDetails"]>) => {
    onChange({
      ...room,
      slopeDetails: { ...room.slopeDetails!, ...partial },
    });
  };

  return (
    <div className="col-span-7 ml-4 pl-4 border-l-2 border-blue-100 py-2 grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 items-center">
      <div className="text-xs text-gray-500 col-span-5 mb-1">
        Dachschräge — Flächenaufteilung für WoFlV:
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Min. Höhe</label>
        <NumberInput
          value={room.slopeDetails.minHeight}
          onChange={(v) => updateSlope({ minHeight: v })}
          suffix="m"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Max. Höhe</label>
        <NumberInput
          value={room.slopeDetails.maxHeight}
          onChange={(v) => updateSlope({ maxHeight: v })}
          suffix="m"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          Fläche &lt;1m (0%)
        </label>
        <NumberInput
          value={room.slopeDetails.areaBelow1m}
          onChange={(v) => updateSlope({ areaBelow1m: v })}
          suffix="m²"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          Fläche 1–2m (50%)
        </label>
        <NumberInput
          value={room.slopeDetails.areaBetween1and2m}
          onChange={(v) => updateSlope({ areaBetween1and2m: v })}
          suffix="m²"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          Fläche &gt;2m (100%)
        </label>
        <NumberInput
          value={room.slopeDetails.areaAbove2m}
          onChange={(v) => updateSlope({ areaAbove2m: v })}
          suffix="m²"
        />
      </div>
    </div>
  );
}

function FloorEditor({
  floor,
  onChange,
  onRemove,
  isExpanded,
  onToggle,
}: {
  floor: Floor;
  onChange: (floor: Floor) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const updateRoom = (index: number, room: Room) => {
    const rooms = [...floor.rooms];
    rooms[index] = room;
    const floorArea = rooms.reduce((s, r) => s + r.area, 0);
    onChange({ ...floor, rooms, floorArea });
  };

  const removeRoom = (index: number) => {
    const rooms = floor.rooms.filter((_, i) => i !== index);
    const floorArea = rooms.reduce((s, r) => s + r.area, 0);
    onChange({ ...floor, rooms, floorArea });
  };

  const addRoom = () => {
    const newRoom: Room = {
      name: "Neuer Raum",
      width: 3.0,
      length: 4.0,
      area: 12.0,
      x: 0,
      y: 0,
      category: "wohnraum",
      hasSlope: false,
    };
    const rooms = [...floor.rooms, newRoom];
    const floorArea = rooms.reduce((s, r) => s + r.area, 0);
    onChange({ ...floor, rooms, floorArea });
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Floor Header */}
      <div
        className="flex items-center justify-between px-5 py-4 bg-gray-50 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
          <div>
            <input
              type="text"
              value={floor.name}
              onChange={(e) => onChange({ ...floor, name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1 -mx-1"
            />
            <span className="text-sm text-gray-500 ml-3">
              {floor.rooms.length} Räume · {floor.floorArea.toFixed(2)} m²
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-blue-700 whitespace-nowrap">
              Raumhöhe:
            </label>
            <NumberInput
              value={floor.ceilingHeight}
              onChange={(v) => onChange({ ...floor, ceilingHeight: v })}
              step={0.01}
              min={1.5}
              suffix="m"
              className="w-28"
            />
          </div>
          <button
            onClick={onRemove}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="Stockwerk entfernen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rooms */}
      {isExpanded && (
        <div className="p-5 space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_80px_80px_80px_100px_36px] gap-2 text-xs text-gray-500 font-medium px-1">
            <span>Raum</span>
            <span>Kategorie</span>
            <span>Breite</span>
            <span>Länge</span>
            <span className="text-right">Fläche</span>
            <span></span>
            <span></span>
          </div>

          {floor.rooms.map((room, i) => (
            <div key={i}>
              <RoomEditor
                room={room}
                onChange={(r) => updateRoom(i, r)}
                onRemove={() => removeRoom(i)}
              />
              <SlopeEditor
                room={room}
                onChange={(r) => updateRoom(i, r)}
              />
            </div>
          ))}

          <button
            onClick={addRoom}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 mt-3 px-1 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Raum hinzufügen
          </button>
        </div>
      )}
    </div>
  );
}

export default function AnalysisEditor({
  initial,
  onConfirm,
}: AnalysisEditorProps) {
  const [data, setData] = useState<FloorplanAnalysis>(initial);
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(
    new Set(initial.floors.map((_, i) => i))
  );

  const toggleFloor = (index: number) => {
    const next = new Set(expandedFloors);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setExpandedFloors(next);
  };

  const updateFloor = (index: number, floor: Floor) => {
    const floors = [...data.floors];
    floors[index] = floor;
    const totalUsableArea = floors.reduce((s, f) => s + f.floorArea, 0);
    setData({ ...data, floors, totalUsableArea });
  };

  const removeFloor = (index: number) => {
    const floors = data.floors.filter((_, i) => i !== index);
    const totalUsableArea = floors.reduce((s, f) => s + f.floorArea, 0);
    setData({ ...data, floors, totalUsableArea });
  };

  const addFloor = () => {
    const level = data.floors.length;
    const names = [
      "Kellergeschoss",
      "Erdgeschoss",
      "Obergeschoss",
      "Dachgeschoss",
      "Spitzboden",
    ];
    const newFloor: Floor = {
      name: names[level] || `${level}. Stockwerk`,
      level,
      ceilingHeight: 2.5,
      rooms: [],
      floorArea: 0,
    };
    const floors = [...data.floors, newFloor];
    setData({ ...data, floors });
    setExpandedFloors(new Set([...expandedFloors, floors.length - 1]));
  };

  const handleConfirm = () => {
    // Recalculate totals
    const totalUsableArea = data.floors.reduce((s, f) => s + f.floorArea, 0);
    onConfirm({ ...data, totalUsableArea });
  };

  const hasFloors = data.floors.length > 0;
  const hasRooms = data.floors.some((f) => f.rooms.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Daten überprüfen & korrigieren
          </h2>
          <p className="text-gray-500 mt-1">
            Passen Sie die erkannten Werte an, bevor das Ergebnis generiert wird.
            Besonders die Raumhöhen sind wichtig für einen korrekten Gebäudeschnitt.
          </p>
        </div>
      </div>

      {/* Warnung */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>Hinweis:</strong> Die KI-Erkennung liefert Schätzwerte. Bitte
          prüfen Sie insbesondere die <strong>Raumhöhen</strong>,{" "}
          <strong>Raummaße</strong> und <strong>Dachschrägen</strong> anhand der
          tatsächlichen Baupläne, bevor Sie das PDF für die Bank erstellen.
        </div>
      </div>

      {/* Gebäude-Grunddaten */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Gebäudedaten</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Gebäudetyp
            </label>
            <input
              type="text"
              value={data.buildingType}
              onChange={(e) =>
                setData({ ...data, buildingType: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Gebäudebreite
            </label>
            <NumberInput
              value={data.buildingWidth}
              onChange={(v) => setData({ ...data, buildingWidth: v })}
              suffix="m"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Gebäudetiefe
            </label>
            <NumberInput
              value={data.buildingDepth}
              onChange={(v) => setData({ ...data, buildingDepth: v })}
              suffix="m"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Dachform</label>
            <select
              value={data.roofType}
              onChange={(e) =>
                setData({ ...data, roofType: e.target.value as RoofType })
              }
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              {ROOF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {data.roofType !== "Flachdach" && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Dachneigung
              </label>
              <NumberInput
                value={data.roofPitchDegrees || 35}
                onChange={(v) => setData({ ...data, roofPitchDegrees: v })}
                step={1}
                min={5}
                suffix="°"
              />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">
              Adresse (optional)
            </label>
            <input
              type="text"
              value={data.address || ""}
              onChange={(e) =>
                setData({ ...data, address: e.target.value || undefined })
              }
              placeholder="Straße, PLZ Ort"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Stockwerke */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            Stockwerke & Räume
          </h3>
          <button
            onClick={addFloor}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Stockwerk hinzufügen
          </button>
        </div>

        {data.floors.map((floor, i) => (
          <FloorEditor
            key={i}
            floor={floor}
            onChange={(f) => updateFloor(i, f)}
            onRemove={() => removeFloor(i)}
            isExpanded={expandedFloors.has(i)}
            onToggle={() => toggleFloor(i)}
          />
        ))}
      </div>

      {/* Grundriss-Layout mit Schnittlinie */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Grundriss-Layout & Schnittlinie</h3>
            <p className="text-xs text-gray-500 mt-1">
              Räume per Drag &amp; Drop verschieben. Die rote Linie zeigt wo der Schnitt geschnitten wird — nur markierte Räume erscheinen im Schnitt.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={data.cutLineDirection}
              onChange={(e) => setData({ ...data, cutLineDirection: e.target.value as "horizontal" | "vertical" })}
              className="px-2 py-1.5 border rounded-lg text-sm bg-white"
            >
              <option value="horizontal">Horizontaler Schnitt</option>
              <option value="vertical">Vertikaler Schnitt</option>
            </select>
          </div>
        </div>

        {data.floors.map((floor, fi) => (
          <div key={fi} className="bg-white rounded-xl border shadow-sm p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">{floor.name}</h4>
            <FloorPlanCanvas
              floor={floor}
              buildingWidth={data.buildingWidth}
              buildingDepth={data.buildingDepth}
              cutLinePosition={data.cutLinePosition}
              cutLineDirection={data.cutLineDirection}
              onFloorChange={(updatedFloor) => {
                const floors = [...data.floors];
                floors[fi] = updatedFloor;
                const totalUsableArea = floors.reduce((s, f) => s + f.floorArea, 0);
                setData({ ...data, floors, totalUsableArea });
              }}
              onCutLineMove={(pos) => setData({ ...data, cutLinePosition: pos })}
            />
          </div>
        ))}
      </div>

      {/* Schnitt-Layout (nur wenn crossSection vorhanden) */}
      {data.crossSection && <div className="space-y-4">
        <h3 className="font-semibold text-gray-800">
          Schnitt-Layout (Raumpositionen)
        </h3>
        <p className="text-xs text-gray-500 -mt-2">
          Die X-Positionen bestimmen, wo die Räume im Gebäudeschnitt erscheinen (in Metern vom linken Gebäuderand).
        </p>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">Schnittrichtung</label>
            <input
              type="text"
              value={data.crossSection.cutDirection}
              onChange={(e) => setData({
                ...data,
                crossSection: { ...data.crossSection!, cutDirection: e.target.value }
              })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          {data.crossSection.floors.map((csFloor, cfi) => (
            <div key={cfi} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-700">{csFloor.name}</span>
                <span className="text-xs text-gray-400">(Level {csFloor.level})</span>
              </div>
              <div className="space-y-1.5">
                {/* Header */}
                <div className="grid grid-cols-[1fr_70px_70px_80px_32px] gap-2 text-xs text-gray-500 px-1">
                  <span>Raum</span>
                  <span>X-Start (m)</span>
                  <span>X-Ende (m)</span>
                  <span>Schräge</span>
                  <span></span>
                </div>
                {csFloor.rooms.map((csRoom, cri) => (
                  <div key={cri} className="grid grid-cols-[1fr_70px_70px_80px_32px] gap-2 items-center">
                    <input
                      type="text"
                      value={csRoom.name}
                      onChange={(e) => {
                        const newFloors = [...data.crossSection!.floors];
                        const newRooms = [...newFloors[cfi].rooms];
                        newRooms[cri] = { ...csRoom, name: e.target.value };
                        newFloors[cfi] = { ...newFloors[cfi], rooms: newRooms };
                        setData({ ...data, crossSection: { ...data.crossSection!, floors: newFloors } });
                      }}
                      className="px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <NumberInput
                      value={csRoom.xStart}
                      onChange={(v) => {
                        const newFloors = [...data.crossSection!.floors];
                        const newRooms = [...newFloors[cfi].rooms];
                        newRooms[cri] = { ...csRoom, xStart: v };
                        newFloors[cfi] = { ...newFloors[cfi], rooms: newRooms };
                        setData({ ...data, crossSection: { ...data.crossSection!, floors: newFloors } });
                      }}
                      step={0.1}
                      suffix="m"
                    />
                    <NumberInput
                      value={csRoom.xEnd}
                      onChange={(v) => {
                        const newFloors = [...data.crossSection!.floors];
                        const newRooms = [...newFloors[cfi].rooms];
                        newRooms[cri] = { ...csRoom, xEnd: v };
                        newFloors[cfi] = { ...newFloors[cfi], rooms: newRooms };
                        setData({ ...data, crossSection: { ...data.crossSection!, floors: newFloors } });
                      }}
                      step={0.1}
                      suffix="m"
                    />
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={csRoom.hasSlope}
                        onChange={(e) => {
                          const newFloors = [...data.crossSection!.floors];
                          const newRooms = [...newFloors[cfi].rooms];
                          newRooms[cri] = {
                            ...csRoom,
                            hasSlope: e.target.checked,
                            slopeStartHeight: e.target.checked ? 0.8 : undefined,
                            slopeEndHeight: e.target.checked ? csFloor.ceilingHeight : undefined,
                          };
                          newFloors[cfi] = { ...newFloors[cfi], rooms: newRooms };
                          setData({ ...data, crossSection: { ...data.crossSection!, floors: newFloors } });
                        }}
                        className="rounded border-gray-300"
                      />
                      Schräge
                    </label>
                    <button
                      onClick={() => {
                        const newFloors = [...data.crossSection!.floors];
                        newFloors[cfi] = {
                          ...newFloors[cfi],
                          rooms: newFloors[cfi].rooms.filter((_, i) => i !== cri),
                        };
                        setData({ ...data, crossSection: { ...data.crossSection!, floors: newFloors } });
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* Bestätigen */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-gray-500">
          {data.floors.length} Stockwerke ·{" "}
          {data.floors.reduce((s, f) => s + f.rooms.length, 0)} Räume ·{" "}
          {data.floors
            .reduce((s, f) => s + f.floorArea, 0)
            .toFixed(2)}{" "}
          m² Gesamtfläche
        </div>
        <button
          onClick={handleConfirm}
          disabled={!hasFloors || !hasRooms}
          className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Check className="w-4 h-4" />
          Ergebnis generieren
        </button>
      </div>
    </div>
  );
}
