"use client";

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Line as SvgLine,
  Rect as SvgRect,
  Polygon as SvgPolygon,
  G,
  Text as SvgText,
} from "@react-pdf/renderer";
import { FloorplanAnalysis } from "@/types/floorplan";

// react-pdf SvgText types are incomplete — cast to bypass
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SvgTextAny = SvgText as any;
import {
  calculateRoomLivingArea,
  calculateFloorLivingArea,
  getFactorLabel,
} from "@/lib/area-calculation";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20, borderBottom: "2px solid #2563eb", paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: "bold", color: "#1e3a5f" },
  subtitle: { fontSize: 11, color: "#6b7280", marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "bold", marginTop: 16, marginBottom: 8, color: "#1e3a5f" },
  table: { width: "100%" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: "1px solid #d1d5db", padding: 5 },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #e5e7eb", padding: 5 },
  cell: { flex: 1 },
  cellRight: { flex: 1, textAlign: "right" },
  cellWide: { flex: 2 },
  bold: { fontWeight: "bold" },
  summaryRow: { flexDirection: "row", backgroundColor: "#eff6ff", padding: 6, marginTop: 2 },
  totalBox: { marginTop: 16, padding: 12, backgroundColor: "#eff6ff", borderRadius: 4 },
  totalLabel: { fontSize: 12, fontWeight: "bold", color: "#1e3a5f" },
  totalValue: { fontSize: 18, fontWeight: "bold", color: "#2563eb" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#9ca3af", textAlign: "center" },
  note: { fontSize: 8, color: "#6b7280", marginTop: 8, padding: 8, backgroundColor: "#f9fafb" },
});

export interface PdfDocumentProps {
  analysis: FloorplanAnalysis;
  floorplanImages?: string[];
}

/* ── Grundriss-Seite ─────────────────────────────── */
function FloorplanPages({ images }: { images: string[] }) {
  return (
    <>
      {images.map((img, i) => (
        <Page key={i} size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>Grundriss {images.length > 1 ? `(${i + 1}/${images.length})` : ""}</Text>
            <Text style={styles.subtitle}>Hochgeladener Originalplan</Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Image
              src={img}
              style={{ maxWidth: "100%", maxHeight: 620, objectFit: "contain" }}
            />
          </View>
          <Text style={styles.footer}>Erstellt mit Zeichner — KI-gestützte Grundrissanalyse</Text>
        </Page>
      ))}
    </>
  );
}

/* ── Schnitt-Seite (basierend auf floors-Daten) ── */
function pdfLayoutRooms(
  rooms: { name: string; width: number; length: number; x: number; y: number }[],
  bWidth: number,
  cutPos: number,
  cutDir: "horizontal" | "vertical"
) {
  const filtered = rooms.filter((r) => {
    if (cutDir === "horizontal") return r.y <= cutPos && r.y + r.length >= cutPos;
    return r.x <= cutPos && r.x + r.width >= cutPos;
  });
  const source = filtered.length > 0 ? filtered : rooms;
  const sorted = [...source].sort((a, b) => (cutDir === "horizontal" ? a.x - b.x : a.y - b.y));
  const total = sorted.reduce((s, r) => s + r.width, 0);
  const scale = total > 0 ? bWidth / total : 1;
  let x = 0;
  return sorted.map((r) => {
    const w = r.width * scale;
    const layout = { name: r.name, xStart: x, width: w };
    x += w;
    return layout;
  });
}

function CrossSectionPage({ analysis }: PdfDocumentProps) {
  const { floors, roofType, roofPitchDegrees, buildingWidth } = analysis;
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);
  const svgW = 520;
  const svgH = 450;
  const mx = 55, mt = 30, mb = 35;
  const wallT = 4;
  const innerW = 2;
  const slabT = 2.5;
  const totalFloorH = sortedFloors.reduce((s, f) => s + f.ceilingHeight, 0);
  const roofH = roofType === "Flachdach" ? 0.4 : (buildingWidth / 2) * Math.tan(((roofPitchDegrees || 35) * Math.PI) / 180);
  const foundH = 0.35;
  const totalH = totalFloorH + roofH + foundH;
  const dw = svgW - mx * 2;
  const dh = svgH - mt - mb;
  const scaleX = dw / buildingWidth;
  const scaleY = dh / totalH;
  const groundY = mt + dh - foundH * scaleY;
  const bL = mx;
  const bR = mx + buildingWidth * scaleX;
  const mToH = (m: number) => m * scaleY;

  let curY = groundY;
  const floorPos: { floor: typeof sortedFloors[0]; top: number; bottom: number; h: number; roomLayouts: ReturnType<typeof pdfLayoutRooms> }[] = [];
  for (const f of sortedFloors) {
    const h = mToH(f.ceilingHeight);
    curY -= h;
    const roomLayouts = pdfLayoutRooms(f.rooms, buildingWidth, analysis.cutLinePosition, analysis.cutLineDirection);
    floorPos.push({ floor: f, top: curY, bottom: curY + h, h, roomLayouts });
  }
  const roofBaseY = floorPos.length > 0 ? floorPos[floorPos.length - 1].top : groundY;
  const roofPeakY = roofBaseY - mToH(roofH);
  const peakX = (bL + bR) / 2;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Gebäudeschnitt</Text>
        <Text style={styles.subtitle}>Schematischer Querschnitt</Text>
      </View>
      <Svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: 420 }}>
        <SvgRect x={bL - 3} y={groundY} width={bR - bL + 6} height={mToH(foundH)} fill="#d4d4d4" stroke="#2d2d2d" strokeWidth={0.8} />
        <SvgLine x1={bL - 20} y1={groundY} x2={bR + 20} y2={groundY} stroke="#8B7355" strokeWidth={1.5} />

        {floorPos.map((fp, fi) => {
          const { floor, top, bottom, h, roomLayouts } = fp;
          return (
            <G key={fi}>
              <SvgRect x={bL} y={bottom - slabT / 2} width={bR - bL} height={slabT} fill="#999" opacity="0.35" />
              {fi === floorPos.length - 1 && (
                <SvgRect x={bL} y={top - slabT / 2} width={bR - bL} height={slabT} fill="#999" opacity="0.3" />
              )}
              <SvgRect x={bL} y={top} width={wallT} height={h} fill="#2d2d2d" opacity="0.7" />
              <SvgRect x={bR - wallT} y={top} width={wallT} height={h} fill="#2d2d2d" opacity="0.7" />

              {roomLayouts.map((rl, ri) => {
                const rx = bL + rl.xStart * scaleX + (ri === 0 ? wallT : 0);
                const rw = rl.width * scaleX - (ri === 0 ? wallT : 0) - (ri === roomLayouts.length - 1 ? wallT : 0);
                return (
                  <G key={ri}>
                    <SvgRect x={rx} y={top + slabT / 2} width={Math.max(rw, 1)} height={h - slabT} fill="#fafafa" stroke="none" />
                    {ri < roomLayouts.length - 1 && (
                      <SvgRect x={rx + rw - innerW / 2} y={top + slabT / 2} width={innerW} height={h - slabT} fill="#2d2d2d" opacity="0.5" />
                    )}
                    {rw > 25 && (
                      <SvgTextAny x={rx + rw / 2} y={top + h / 2 + 1} fill="#374151" fontSize={rw > 40 ? 7 : 5} textAnchor="middle">
                        {rl.name}
                      </SvgTextAny>
                    )}
                  </G>
                );
              })}

              <SvgLine x1={bR + 12} y1={top} x2={bR + 12} y2={bottom} stroke="#c00" strokeWidth={0.5} />
              <SvgLine x1={bR + 8} y1={top} x2={bR + 16} y2={top} stroke="#c00" strokeWidth={0.5} />
              <SvgLine x1={bR + 8} y1={bottom} x2={bR + 16} y2={bottom} stroke="#c00" strokeWidth={0.5} />
              <SvgTextAny x={bR + 22} y={top + h / 2 + 3} fill="#c00" fontSize={7}>{floor.ceilingHeight.toFixed(2)} m</SvgTextAny>
            </G>
          );
        })}

        {roofType === "Flachdach" ? (
          <SvgRect x={bL - 8} y={roofBaseY - 6} width={bR - bL + 16} height={6} fill="#d4d4d4" stroke="#2d2d2d" strokeWidth={0.8} />
        ) : (
          <G>
            <SvgLine x1={bL - 10} y1={roofBaseY + 3} x2={peakX} y2={roofPeakY} stroke="#2d2d2d" strokeWidth={1.2} />
            <SvgLine x1={peakX} y1={roofPeakY} x2={bR + 10} y2={roofBaseY + 3} stroke="#2d2d2d" strokeWidth={1.2} />
            <SvgRect x={peakX - 2} y={roofPeakY - 1} width={4} height={4} fill="#2d2d2d" />
            {roofPitchDegrees && (
              <SvgTextAny x={bL + (bR - bL) * 0.25} y={roofBaseY - (roofBaseY - roofPeakY) * 0.35} fill="#555" fontSize={7}>
                {roofPitchDegrees}°
              </SvgTextAny>
            )}
          </G>
        )}

        <SvgLine x1={bL - 22} y1={roofPeakY} x2={bL - 22} y2={groundY} stroke="#c00" strokeWidth={0.5} />
        <SvgTextAny x={bL - 27} y={(roofPeakY + groundY) / 2 + 3} fill="#c00" fontSize={7} textAnchor="end" fontWeight="bold">
          {(totalFloorH + roofH).toFixed(2)} m
        </SvgTextAny>
        <SvgLine x1={bL} y1={groundY + 16} x2={bR} y2={groundY + 16} stroke="#555" strokeWidth={0.5} />
        <SvgTextAny x={peakX} y={groundY + 26} fill="#555" fontSize={7} textAnchor="middle">{buildingWidth.toFixed(2)} m</SvgTextAny>
        <SvgTextAny x={svgW - 10} y={svgH - 5} fill="#9ca3af" fontSize={7} textAnchor="end">SCHNITT</SvgTextAny>
      </Svg>
      <View style={styles.note}>
        <Text>Gesamthöhe: {(totalFloorH + roofH).toFixed(2)} m | Gebäudebreite: {buildingWidth.toFixed(2)} m | Dach: {roofType}{roofPitchDegrees ? ` ${roofPitchDegrees}°` : ""}</Text>
      </View>
      <Text style={styles.footer}>Erstellt mit Zeichner — KI-gestützte Grundrissanalyse</Text>
    </Page>
  );
}

/* ── 3D-Isometrie-Seite ─────────────────────────── */
function iso(x: number, y: number, z: number): [number, number] {
  const isoX = (x - y) * Math.cos(Math.PI / 6);
  const isoY = (x + y) * Math.sin(Math.PI / 6) - z;
  return [isoX, isoY];
}

function isoP(x: number, y: number, z: number, ox: number, oy: number, s: number): string {
  const [ix, iy] = iso(x * s, y * s, z * s);
  return `${(ox + ix).toFixed(1)},${(oy + iy).toFixed(1)}`;
}

function IsometricPage({ analysis }: PdfDocumentProps) {
  const { floors, roofType, roofPitchDegrees, buildingWidth, buildingDepth } = analysis;
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level);

  const svgW = 500;
  const svgH = 420;
  const ox = svgW / 2;
  const oy = svgH - 50;

  const maxDim = Math.max(buildingWidth, buildingDepth, 10);
  const totalFloorH = sortedFloors.reduce((s, f) => s + f.ceilingHeight, 0);
  const roofH = roofType === "Flachdach" ? 0.3 : (buildingWidth / 2) * Math.tan(((roofPitchDegrees || 35) * Math.PI) / 180);
  const totalH = totalFloorH + roofH;
  const s = Math.min(150 / maxDim, 120 / totalH);

  const w = buildingWidth;
  const d = buildingDepth;
  const p = (x: number, y: number, z: number) => isoP(x, y, z, ox, oy, s);

  const floorColors = ["#dbeafe", "#e0e7ff", "#fef3c7", "#fce7f3", "#d1fae5"];
  const wallColors = ["#93c5fd", "#a5b4fc", "#fcd34d", "#f9a8d4", "#6ee7b7"];
  const sideColors = ["#60a5fa", "#818cf8", "#f59e0b", "#ec4899", "#34d399"];

  let currentZ = 0;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>3D-Ansicht</Text>
        <Text style={styles.subtitle}>Isometrische Darstellung</Text>
      </View>
      <Svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: 400 }}>
        {/* Ground */}
        <SvgPolygon
          points={`${p(-0.5, -0.5, 0)} ${p(w + 0.5, -0.5, 0)} ${p(w + 0.5, d + 0.5, 0)} ${p(-0.5, d + 0.5, 0)}`}
          fill="#e5e7eb"
          opacity="0.4"
        />

        {/* Floors */}
        {sortedFloors.map((floor, i) => {
          const h = floor.ceilingHeight;
          const z0 = currentZ;
          const z1 = currentZ + h;
          currentZ = z1;

          return (
            <G key={i}>
              {/* Front face */}
              <SvgPolygon
                points={`${p(0, d, z0)} ${p(w, d, z0)} ${p(w, d, z1)} ${p(0, d, z1)}`}
                fill={wallColors[i % wallColors.length]}
                stroke="#374151"
                strokeWidth={0.8}
              />
              {/* Right face */}
              <SvgPolygon
                points={`${p(w, 0, z0)} ${p(w, d, z0)} ${p(w, d, z1)} ${p(w, 0, z1)}`}
                fill={sideColors[i % sideColors.length]}
                stroke="#374151"
                strokeWidth={0.8}
              />
              {/* Top face (only for top floor with flat roof) */}
              {i === sortedFloors.length - 1 && roofType === "Flachdach" && (
                <SvgPolygon
                  points={`${p(0, 0, z1)} ${p(w, 0, z1)} ${p(w, d, z1)} ${p(0, d, z1)}`}
                  fill={floorColors[i % floorColors.length]}
                  stroke="#374151"
                  strokeWidth={0.8}
                />
              )}
              {/* Floor label */}
              <SvgTextAny
                x={parseFloat(isoP(w / 2, d, (z0 + z1) / 2, ox, oy, s).split(",")[0])}
                y={parseFloat(isoP(w / 2, d, (z0 + z1) / 2, ox, oy, s).split(",")[1])}
                textAnchor="middle"
                fontSize={9}
                fill="#1e3a5f"
                fontWeight="bold"
              >
                {floor.name}
              </SvgTextAny>
            </G>
          );
        })}

        {/* Roof */}
        {roofType !== "Flachdach" && (() => {
          const z = currentZ;
          const rh = roofH;
          if (roofType === "Walmdach") {
            return (
              <G>
                <SvgPolygon points={`${p(0, d, z)} ${p(w, d, z)} ${p(w * 0.7, d, z + rh)} ${p(w * 0.3, d, z + rh)}`} fill="#f59e0b" stroke="#92400e" strokeWidth={1} />
                <SvgPolygon points={`${p(w, 0, z)} ${p(w, d, z)} ${p(w * 0.7, d, z + rh)} ${p(w * 0.7, 0, z + rh)}`} fill="#d97706" stroke="#92400e" strokeWidth={1} />
                <SvgPolygon points={`${p(w * 0.3, 0, z + rh)} ${p(w * 0.7, 0, z + rh)} ${p(w * 0.7, d, z + rh)} ${p(w * 0.3, d, z + rh)}`} fill="#fbbf24" stroke="#92400e" strokeWidth={1} />
              </G>
            );
          }
          return (
            <G>
              <SvgPolygon points={`${p(0, d, z)} ${p(w, d, z)} ${p(w / 2, d, z + rh)}`} fill="#f59e0b" stroke="#92400e" strokeWidth={1} />
              <SvgPolygon points={`${p(w, 0, z)} ${p(w, d, z)} ${p(w / 2, d, z + rh)} ${p(w / 2, 0, z + rh)}`} fill="#d97706" stroke="#92400e" strokeWidth={1} />
            </G>
          );
        })()}

        {/* Dimension labels */}
        <SvgTextAny x={parseFloat(isoP(w / 2, d + 1.5, 0, ox, oy, s).split(",")[0])} y={parseFloat(isoP(w / 2, d + 1.5, 0, ox, oy, s).split(",")[1])} fontSize={9} fill="#6b7280" textAnchor="middle">
          {buildingWidth.toFixed(1)} m
        </SvgTextAny>
        <SvgTextAny x={parseFloat(isoP(w + 1.5, d / 2, 0, ox, oy, s).split(",")[0])} y={parseFloat(isoP(w + 1.5, d / 2, 0, ox, oy, s).split(",")[1])} fontSize={9} fill="#6b7280" textAnchor="middle">
          {buildingDepth.toFixed(1)} m
        </SvgTextAny>
      </Svg>
      <View style={styles.note}>
        <Text>
          Isometrische Darstellung | {analysis.buildingType} | {sortedFloors.length} Stockwerke | Dach: {roofType}{roofPitchDegrees ? ` ${roofPitchDegrees}°` : ""}
        </Text>
      </View>
      <Text style={styles.footer}>Erstellt mit Zeichner — KI-gestützte Grundrissanalyse</Text>
    </Page>
  );
}

/* ── Flächenberechnung-Seite ─────────────────────── */
function AreaReportPage({ analysis }: PdfDocumentProps) {
  const totalWohnflaeche = analysis.floors.reduce(
    (sum, f) => sum + calculateFloorLivingArea(f), 0
  );

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Wohnflächenberechnung</Text>
        <Text style={styles.subtitle}>nach Wohnflächenverordnung (WoFlV)</Text>
      </View>

      {analysis.floors.map((floor) => (
        <View key={floor.level}>
          <Text style={styles.sectionTitle}>
            {floor.name} (Raumhöhe: {floor.ceilingHeight.toFixed(2)} m)
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cellWide, styles.bold]}>Raum</Text>
              <Text style={[styles.cell, styles.bold]}>Kategorie</Text>
              <Text style={[styles.cellRight, styles.bold]}>Fläche m²</Text>
              <Text style={[styles.cellRight, styles.bold]}>Faktor</Text>
              <Text style={[styles.cellRight, styles.bold]}>Wohnfl. m²</Text>
            </View>
            {floor.rooms.map((room, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.cellWide}>{room.name}</Text>
                <Text style={styles.cell}>{room.category}</Text>
                <Text style={styles.cellRight}>{room.area.toFixed(2)}</Text>
                <Text style={styles.cellRight}>{getFactorLabel(room)}</Text>
                <Text style={styles.cellRight}>{calculateRoomLivingArea(room).toFixed(2)}</Text>
              </View>
            ))}
            <View style={styles.summaryRow}>
              <Text style={[styles.cellWide, styles.bold]}>Summe {floor.name}</Text>
              <Text style={styles.cell}></Text>
              <Text style={[styles.cellRight, styles.bold]}>{floor.floorArea.toFixed(2)}</Text>
              <Text style={styles.cellRight}></Text>
              <Text style={[styles.cellRight, styles.bold]}>{calculateFloorLivingArea(floor).toFixed(2)}</Text>
            </View>
          </View>
        </View>
      ))}

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Gesamtwohnfläche nach WoFlV</Text>
        <Text style={styles.totalValue}>{totalWohnflaeche.toFixed(2)} m²</Text>
        <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>
          Gesamtnutzfläche: {analysis.totalUsableArea.toFixed(2)} m²
        </Text>
      </View>

      <View style={styles.note}>
        <Text>
          Balkone/Terrassen: 25% | Loggien: 50% | Dachschräge unter 1m: 0%, 1–2m: 50%, über 2m: 100% | Keller/Garagen: 0%
        </Text>
      </View>
      <Text style={styles.footer}>Erstellt mit Zeichner — KI-gestützte Grundrissanalyse</Text>
    </Page>
  );
}

/* ── Gesamt-Dokument ─────────────────────────────── */
export default function PdfFloorplanDocument({ analysis, floorplanImages }: PdfDocumentProps) {
  const date = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Document>
      {/* 1. Deckblatt */}
      <Page size="A4" style={[styles.page, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ fontSize: 28, fontWeight: "bold", color: "#1e3a5f" }}>
          Grundrissanalyse
        </Text>
        <Text style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>
          Gebäudeschnitt, 3D-Ansicht &amp; Wohnflächenberechnung
        </Text>
        <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 24 }}>
          {analysis.buildingType}
        </Text>
        {analysis.address && (
          <Text style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
            {analysis.address}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 40 }}>
          Erstellt am {date}
        </Text>
        <Text style={styles.footer}>Erstellt mit Zeichner — KI-gestützte Grundrissanalyse</Text>
      </Page>

      {/* 2. Grundrisse (Originale) */}
      {floorplanImages && floorplanImages.length > 0 && <FloorplanPages images={floorplanImages} />}

      {/* 3. Schnittzeichnung */}
      <CrossSectionPage analysis={analysis} />

      {/* 4. 3D-Isometrie */}
      <IsometricPage analysis={analysis} />

      {/* 5. Flächenberechnung */}
      <AreaReportPage analysis={analysis} />
    </Document>
  );
}
