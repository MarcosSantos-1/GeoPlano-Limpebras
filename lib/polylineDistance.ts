/**
 * Distância (m) do ponto à polilinha — plano local em torno da latitude do ponto.
 */

function distancePointToSegmentMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const lat0 = (p[0] * Math.PI) / 180;
  const mLat = 111320;
  const mLon = 111320 * Math.cos(lat0);
  const px = p[1] * mLon;
  const py = p[0] * mLat;
  const ax = a[1] * mLon;
  const ay = a[0] * mLat;
  const bx = b[1] * mLon;
  const by = b[0] * mLat;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

/** Menor distância do ponto a qualquer segmento da polilinha (metros). */
export function minDistancePointToPolylineMeters(
  p: [number, number],
  coords: [number, number][],
): number {
  if (coords.length < 2) return Infinity;
  let m = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distancePointToSegmentMeters(p, coords[i], coords[i + 1]);
    if (d < m) m = d;
  }
  return m;
}

/** Raio (m) para considerar linhas “no mesmo local” (clique em sobreposição). */
export const OVERLAPPING_LINE_PICK_METERS = 48;
