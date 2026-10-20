/**
 * I-Spy: 10-mile photo scavenger hunt.
 *
 * Players post photo clues of real-world things near them; other players
 * within 10 miles try to find them. Region-level visibility only — raw
 * coordinates are quantized client-side (see geoRadius.ts) and precise
 * locations are never exposed in responses.
 */
import { distanceKm, quantizeCoordinates, APPROXIMATE_GRID_UNCERTAINTY_KM } from './geoRadius';
import type { Coordinates } from './geoRadius';
import { FAMILIARS } from './regions';

/** Difficulty vocabulary matches her dare-intensity words. */
export type SpyDifficulty = 'easy' | 'spicy' | 'feral';

export const SPY_DIFFICULTIES: SpyDifficulty[] = ['easy', 'spicy', 'feral'];

export interface FinderEntry {
  userId: string;
  at: string; // ISO timestamp
  method: 'photo' | 'gps';
}

export interface Spy {
  id: string;
  posterId: string;
  /** Coarse region label (e.g. "near Kosciusko") — never coordinates. */
  regionBucket: string;
  photoUrl: string;
  hint: string;
  difficulty: SpyDifficulty;
  createdAt: string;
  expiresAt: string;
  finders: FinderEntry[];
}

/**
 * Quantized coordinates, stored server-side ONLY for distance math.
 * Never serialized to clients — responses carry regionBucket + approxMiles.
 */
export interface QuantizedPosition {
  latitude: number;
  longitude: number;
}

/** 10-mile hunt radius. */
export const ISPY_RADIUS_MILES = 10;
export const ISPY_RADIUS_KM = ISPY_RADIUS_MILES * 1.60934;

/** TBD-BY-AMBER: spy lifetime. 5-minute rounds (her call 2026-10-19). */
// TBD-BY-AMBER (2026-10-19): 5-minute rounds — fast, hyperlocal, blink-and-miss-it.
export const ISPY_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Scoring. TBD-BY-AMBER: these numbers are opening bids, not canon.
 * Plugged into the Khaos Points vault via POST /api/points/award actions.
 */
export const ISPY_POINTS = {
  post: 15, // posting a spy (TBD-BY-AMBER)
  find: 20, // finding a spy (TBD-BY-AMBER)
  firstFindBonus: 10, // extra for the FIRST finder (TBD-BY-AMBER)
  stickerSpot: 10, // each party on a "Spy Me!" sticker spot (TBD-BY-AMBER)
} as const;

/** "Spy Me!" bumper-sticker QR payload format. */
export const SPY_QR_PREFIX = 'ispy:';

export function isSpyExpired(spy: Spy, now = Date.now()): boolean {
  return now >= new Date(spy.expiresAt).getTime();
}

/** Human "time left" for cards: "31h left", "42m left", "expired". */
export function spyTimeLeft(spy: Spy, now = Date.now()): string {
  const ms = new Date(spy.expiresAt).getTime() - now;
  if (ms <= 0) return 'expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

/**
 * Region-level check: is the viewer close enough to see this spy?
 * Adds the quantization uncertainty margin so borderline spies aren't
 * wrongly hidden by grid snapping.
 */
export function withinSpyRadius(spyPos: QuantizedPosition, viewerPos: Coordinates): boolean {
  return distanceKm(spyPos, viewerPos) <= ISPY_RADIUS_KM + APPROXIMATE_GRID_UNCERTAINTY_KM;
}

/**
 * Coarse distance label for cards — whole miles, rounded down, never precise.
 */
export function spyDistanceLabel(spyPos: QuantizedPosition, viewerPos: Coordinates): string {
  const miles = distanceKm(spyPos, viewerPos) * 0.621371;
  if (miles < 1) return 'under a mile away';
  return `about ${Math.floor(miles)} mi away`;
}

/**
 * Coarse region bucket for a position: nearest Familiar zone city when inside
 * one, otherwise "the wilds". Never exposes coordinates.
 */
export function regionBucketFor(coordinates: Coordinates): string {
  const quantized = quantizeCoordinates(coordinates);
  let nearest: { city: string; distance: number } | null = null;
  for (const familiar of FAMILIARS) {
    const distance = distanceKm(quantized, familiar.coordinates);
    if (distance <= familiar.radiusKm && (!nearest || distance < nearest.distance)) {
      nearest = { city: familiar.city, distance };
    }
  }
  return nearest ? `near ${nearest.city}` : 'the wilds';
}

/** Quantize a position client-side before it ever leaves the device. */
export function quantizeSpyPosition(coordinates: Coordinates): QuantizedPosition {
  return quantizeCoordinates(coordinates);
}

/**
 * Parse a "Spy Me!" sticker QR payload. Format: `ispy:<ownerUserId>`.
 * Returns the owner user id, or null when the payload is malformed.
 */
export function parseSpyQrPayload(payload: unknown): string | null {
  if (typeof payload !== 'string') return null;
  const match = /^ispy:([A-Za-z0-9_-]{1,64})$/.exec(payload.trim());
  return match ? match[1] : null;
}

export function difficultyLabel(difficulty: SpyDifficulty): string {
  switch (difficulty) {
    case 'easy': return 'Easy';
    case 'spicy': return 'Spicy';
    case 'feral': return 'Feral';
  }
}

export function difficultyTagline(difficulty: SpyDifficulty): string {
  switch (difficulty) {
    case 'easy': return 'Sunday stroll. You got this.';
    case 'spicy': return 'Sweat a little. Worth it.';
    case 'feral': return 'Touch grass. Lose your mind.';
  }
}
