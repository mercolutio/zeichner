"use client";

import { Floor } from "@/types/floorplan";
import {
  calculateRoomLivingArea,
  getFactorLabel,
} from "@/lib/area-calculation";

interface RoomTableProps {
  floors: Floor[];
}

const categoryLabels: Record<string, string> = {
  wohnraum: "Wohnraum",
  nutzraum: "Nutzraum",
  balkon: "Balkon",
  terrasse: "Terrasse",
  loggia: "Loggia",
  keller: "Keller",
  garage: "Garage",
};

export default function RoomTable({ floors }: RoomTableProps) {
  return (
    <div className="space-y-6">
      {floors.map((floor) => (
        <div key={floor.level} className="bg-white rounded-xl border shadow-sm">
          <div className="px-5 py-3 border-b bg-gray-50 rounded-t-xl">
            <h3 className="font-semibold text-gray-800">
              {floor.name}{" "}
              <span className="text-sm font-normal text-gray-500">
                (Raumhöhe: {floor.ceilingHeight.toFixed(2)} m)
              </span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="px-5 py-2.5 font-medium">Raum</th>
                  <th className="px-5 py-2.5 font-medium">Kategorie</th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Breite (m)
                  </th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Länge (m)
                  </th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Fläche (m²)
                  </th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Faktor
                  </th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Wohnfl. (m²)
                  </th>
                </tr>
              </thead>
              <tbody>
                {floor.rooms.map((room, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-5 py-2.5 font-medium text-gray-800">
                      {room.name}
                    </td>
                    <td className="px-5 py-2.5 text-gray-600">
                      {categoryLabels[room.category] || room.category}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-600">
                      {room.width.toFixed(2)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-600">
                      {room.length.toFixed(2)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-800">
                      {room.area.toFixed(2)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-500">
                      {getFactorLabel(room)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium text-gray-800">
                      {calculateRoomLivingArea(room).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-5 py-2.5 text-gray-700">
                    Summe {floor.name}
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-800">
                    {floor.floorArea.toFixed(2)}
                  </td>
                  <td className="px-5 py-2.5"></td>
                  <td className="px-5 py-2.5 text-right text-blue-600">
                    {floor.rooms
                      .reduce(
                        (sum, room) => sum + calculateRoomLivingArea(room),
                        0
                      )
                      .toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
