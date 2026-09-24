import { randomInt, type RNG } from '../utils/RNG';

/**
 * What a blow actually does, and what a body does about it.
 *
 * Damage is typed rather than a single number so that the *same* weapon can be good against one
 * thing and useless against another: armour turns a cut far better than it stops a thrust, and a
 * creature with nothing vital to puncture barely notices being stabbed at all. Creatures carry
 * open-ended `tags` instead of a fixed anatomy schema (hasHead, hasArms, ...), because that list
 * never stops growing — adding a concept here should mean adding a tag and a rule, not migrating
 * every creature in the game.
 */

export type DamageType = 'cut' | 'pierce' | 'bludgeon' | 'fire' | 'cold' | 'shock' | 'acid' | 'rad';

/** Types that a strong arm makes worse. Energy doesn't care how strong you are. */
export const PHYSICAL_TYPES: ReadonlySet<DamageType> = new Set<DamageType>(['cut', 'pierce', 'bludgeon']);

/** One component of an attack: a katana is mostly cut with some pierce. */
export interface DamagePacket {
  type: DamageType;
  min: number;
  max: number;
}

/**
 * How much of a type is shrugged off, as a fraction: 0.5 halves it, 1 is immunity, and a
 * *negative* value is a vulnerability (dry rot and fire). Absent means no opinion either way.
 */
export type Resistances = Partial<Record<DamageType, number>>;

/** Resistance can't make a blow heal you; vulnerability is capped so nothing one-shots absurdly. */
const MIN_MULTIPLIER = 0;
const MAX_MULTIPLIER = 3;

export function resistanceMultiplier(resistances: Resistances | undefined, type: DamageType): number {
  const resist = resistances?.[type] ?? 0;
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, 1 - resist));
}

/** Adds up several sources — a creature's own hide plus whatever it's wearing. */
export function combineResistances(...sources: Array<Resistances | undefined>): Resistances {
  const combined: Resistances = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [type, value] of Object.entries(source) as Array<[DamageType, number]>) {
      combined[type] = (combined[type] ?? 0) + value;
    }
  }
  return combined;
}

export interface DamageRoll {
  total: number;
  /** What got through, per type — so a hit can be described by what actually hurt. */
  byType: Partial<Record<DamageType, number>>;
  /** True when every component was fully resisted: the blow landed and did nothing at all. */
  shrugged: boolean;
  /**
   * How much the defender turned, 0..1. Anything high means the player is swinging the wrong
   * thing and should be told so — that's the entire point of having damage types.
   */
  resistedFraction: number;
}

/**
 * Rolls an attack's components and applies the defender's resistances.
 *
 * The Strength bonus goes on the single largest *physical* component before its resistance is
 * applied, rather than on every component — otherwise a two-type weapon like a katana would
 * collect the bonus twice for being descriptive about itself.
 *
 * A blow that gets through at all does at least 1, so rounding can't make a real hit free; a blow
 * that is entirely resisted does exactly 0, because "immune" has to mean immune.
 */
export function rollTypedDamage(
  rng: RNG,
  packets: readonly DamagePacket[],
  attackerStrength: number,
  resistances: Resistances | undefined,
): DamageRoll {
  const rolled = packets.map((packet) => ({ type: packet.type, amount: randomInt(rng, packet.min, packet.max) }));

  const strengthBonus = Math.floor(attackerStrength / 3);
  if (strengthBonus > 0) {
    let best = -1;
    for (let i = 0; i < rolled.length; i++) {
      if (!PHYSICAL_TYPES.has(rolled[i]!.type)) continue;
      if (best === -1 || rolled[i]!.amount > rolled[best]!.amount) best = i;
    }
    if (best !== -1) rolled[best]!.amount += strengthBonus;
  }

  const byType: Partial<Record<DamageType, number>> = {};
  let raw = 0;
  let unresisted = 0;
  for (const { type, amount } of rolled) {
    unresisted += amount;
    const through = amount * resistanceMultiplier(resistances, type);
    if (through <= 0) continue;
    byType[type] = (byType[type] ?? 0) + through;
    raw += through;
  }

  const total = raw > 0 ? Math.max(1, Math.floor(raw)) : 0;
  for (const type of Object.keys(byType) as DamageType[]) {
    byType[type] = Math.max(1, Math.floor(byType[type]!));
  }

  return {
    total,
    byType,
    shrugged: packets.length > 0 && total === 0,
    resistedFraction: unresisted > 0 ? Math.max(0, 1 - raw / unresisted) : 0,
  };
}

/** The type that did the most damage — what the log should describe the blow as. */
export function dominantType(roll: DamageRoll): DamageType | null {
  let best: DamageType | null = null;
  for (const [type, amount] of Object.entries(roll.byType) as Array<[DamageType, number]>) {
    if (best === null || amount > (roll.byType[best] ?? 0)) best = type;
  }
  return best;
}

export function hasTag(tags: readonly string[] | undefined, tag: string): boolean {
  return tags?.includes(tag) ?? false;
}
