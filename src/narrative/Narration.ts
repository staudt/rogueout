/**
 * Turns the outcome of a turn into a line of text.
 *
 * Register is **plain and clipped** — "You hit the raider hard.", not "You land a savage blow".
 * An earlier version of this file was written in a more literary voice and read as medieval,
 * which is wrong for the setting. Keep new lines short, modern and concrete; if a line would sit
 * comfortably in a fantasy novel, it does not belong here.
 *
 * The log used to report mechanics ("You hit the rat for 3."). It now describes what happened,
 * with the damage number replaced by *how hard* the blow landed, measured against what the target
 * can take — a graze on a rat and a graze on something twice its size should not read alike. The
 * exact numbers haven't disappeared from the game: your own HP is in the status bar, and a
 * wounded enemy says so in its own line.
 *
 * All pure: outcome in, string out, no RNG and no state. Variety comes from `seed` (the turn
 * count at the call site) rather than from the game's RNG stream, deliberately — drawing phrasing
 * from the same stream would make what the log *says* change what the dice *do*, and every
 * combat test injects a fixed RNG expecting exact rolls.
 */

export type Severity = 'graze' | 'solid' | 'heavy';

/** A blow's weight, as a fraction of what the target can take. */
const GRAZE_UP_TO = 0.2;
const SOLID_UP_TO = 0.5;

/** Below this fraction of max HP, a combatant is visibly in trouble. */
export const BADLY_HURT = 1 / 3;

export function severityOf(damage: number, targetMaxHp: number): Severity {
  const fraction = targetMaxHp > 0 ? damage / targetMaxHp : 1;
  if (fraction <= GRAZE_UP_TO) return 'graze';
  if (fraction <= SOLID_UP_TO) return 'solid';
  return 'heavy';
}

/** The verb used when nothing is wielded; weapons carry their own (see ItemData.attackVerb). */
export const UNARMED_VERB = 'strike';

const PLAYER_HIT: Record<Severity, readonly string[]> = {
  graze: [
    'You graze {target}.',
    'You clip {target}.',
    'You catch {target}, barely.',
    'You scrape {target}.',
  ],
  solid: [
    'You {verb} {target}.',
    'You hit {target}.',
    'You {verb} {target} solidly.',
    'You land a hit on {target}.',
  ],
  heavy: [
    'You {verb} {target} hard.',
    'You hit {target} hard.',
    'You tear into {target}.',
    'You {verb} {target} and it staggers.',
  ],
};

const PLAYER_MISS: readonly string[] = [
  'You miss {target}.',
  'You swing at {target} and miss.',
  '{target} dodges.',
  'You miss.',
];

/** The blow landed and the target didn't care — a spear against something with nothing to pierce. */
const PLAYER_SHRUGGED: readonly string[] = [
  'You hit {target}. No effect.',
  'Your hit does nothing to {target}.',
  'You {verb} {target}. Nothing happens.',
];

/** Only reachable with a weapon that can take a head off, against something that has one. */
const PLAYER_DECAPITATION: readonly string[] = [
  "You cut {target}'s head off.",
  "You take {target}'s head off.",
  'You behead {target}.',
];

const PLAYER_KILL: readonly string[] = [
  'You kill {target}.',
  '{target} drops.',
  '{target} goes down.',
  'You put {target} down.',
];

const MONSTER_HIT: Record<Severity, readonly string[]> = {
  graze: ['{attacker} grazes you.', '{attacker} clips you.', '{attacker} catches you, barely.'],
  solid: ['{attacker} hits you.', '{attacker} connects.', '{attacker} lands a hit.'],
  heavy: ['{attacker} hits you hard.', '{attacker} slams into you.', '{attacker} tears into you.'],
};

const MONSTER_SHRUGGED: readonly string[] = [
  '{attacker} hits you. No effect.',
  "{attacker}'s hit does nothing.",
];

const MONSTER_MISS: readonly string[] = [
  '{attacker} misses you.',
  '{attacker} swings and misses.',
  'You dodge {attacker}.',
  '{attacker} misses.',
];

export interface PlayerAttack {
  target: string;
  /** The wielded weapon's verb, or UNARMED_VERB. */
  verb: string;
  hit: boolean;
  damage: number;
  targetMaxHp: number;
  killed: boolean;
  /** Landed, but every component was resisted away. */
  shrugged?: boolean;
  /** A killing cut from a weapon that can take a head off, against something that has one. */
  decapitated?: boolean;
  seed: number;
}

export function narratePlayerAttack(attack: PlayerAttack): string {
  const values = { target: attack.target, verb: attack.verb };
  if (!attack.hit) return fill(pickPhrase(PLAYER_MISS, attack.seed), values);
  // Checked before the kill: a blow that did nothing cannot have killed anything.
  if (attack.shrugged) return fill(pickPhrase(PLAYER_SHRUGGED, attack.seed), values);
  if (attack.killed && attack.decapitated) return fill(pickPhrase(PLAYER_DECAPITATION, attack.seed), values);
  if (attack.killed) return fill(pickPhrase(PLAYER_KILL, attack.seed), values);
  return fill(pickPhrase(PLAYER_HIT[severityOf(attack.damage, attack.targetMaxHp)], attack.seed), values);
}

export interface MonsterAttack {
  attacker: string;
  hit: boolean;
  damage: number;
  targetMaxHp: number;
  shrugged?: boolean;
  seed: number;
}

/**
 * Offsets the monster's rotation so it doesn't march in step with the player's.
 *
 * Both sides draw from the turn count, and the player's next blow lands on the same turn number
 * the monster just used — so without this they hit the same index on alternating exchanges, and
 * the log echoed itself: "You twist away from the goblin." / "The goblin twists away from your
 * blow."
 */
const MONSTER_PHRASE_OFFSET = 2;

export function narrateMonsterAttack(attack: MonsterAttack): string {
  const values = { attacker: attack.attacker };
  const seed = attack.seed + MONSTER_PHRASE_OFFSET;
  if (!attack.hit) return fill(pickPhrase(MONSTER_MISS, seed), values);
  if (attack.shrugged) return fill(pickPhrase(MONSTER_SHRUGGED, seed), values);
  return fill(pickPhrase(MONSTER_HIT[severityOf(attack.damage, attack.targetMaxHp)], seed), values);
}

/**
 * How a survivor looks, or null while they're still in decent shape. This is where the damage
 * number went: it matters far more that something is nearly down than that it took exactly 3.
 */
export function narrateCondition(hp: number, maxHp: number): string | null {
  if (hp <= 0 || maxHp <= 0) return null;
  return hp / maxHp <= BADLY_HURT ? 'It is badly hurt.' : null;
}

/** Said once, as the player crosses into trouble — not repeated every turn after. */
const RESISTED: readonly string[] = [
  'Your {verb} barely gets through.',
  '{target} turns most of it.',
  'Wrong tool for {target}.',
];

/**
 * Said when most of a blow was turned away. Without it the damage system is invisible: the player
 * sees small numbers and concludes they're unlucky rather than badly equipped.
 */
export function narrateResisted(target: string, verb: string, seed: number): string {
  return fill(pickPhrase(RESISTED, seed), { target, verb });
}

export const PLAYER_BADLY_HURT = 'You are badly hurt.';

export const PLAYER_DEATH = 'You are dead.';

const WAITING: readonly string[] = ['You wait.', 'You hold still.'];

export function narrateWaiting(seed: number): string {
  return pickPhrase(WAITING, seed);
}

/**
 * Picks one phrase, always the same one for the same seed.
 *
 * A straight rotation, not a hash. Hashing was the first attempt and it read badly in practice:
 * a fight produced "Your blow goes wide of the goblin." three exchanges running, because nothing
 * stopped neighbouring seeds landing on the same entry. Since the seed is the turn count, it
 * advances by one per exchange, so rotating guarantees a line never immediately repeats itself.
 */
export function pickPhrase(options: readonly string[], seed: number): string {
  if (options.length === 0) return '';
  const index = ((Math.trunc(seed) % options.length) + options.length) % options.length;
  return options[index] ?? options[0]!;
}

/**
 * Fills a template and capitalises the result.
 *
 * Templates carry bare placeholders rather than "the {target}", because the caller knows whether
 * the thing has a name ("Corporal Vance") or a kind ("the giant rat"). That means a line can now
 * start with a lowercase label, so the sentence is capitalised here instead.
 */
function fill(template: string, values: Record<string, string>): string {
  const filled = template.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
  return filled.charAt(0).toUpperCase() + filled.slice(1);
}

const BYSTANDER_HIT: readonly string[] = [
  '{attacker} hits {target}.',
  '{attacker} lands a hit on {target}.',
  '{attacker} connects with {target}.',
];

const BYSTANDER_MISS: readonly string[] = [
  '{attacker} misses {target}.',
  '{attacker} swings at {target} and misses.',
];

const BYSTANDER_KILL: readonly string[] = [
  '{attacker} kills {target}.',
  '{target} goes down.',
];

const BYSTANDER_SHRUGGED: readonly string[] = ['{attacker} hits {target}. No effect.'];

export interface BystanderAttack {
  attacker: string;
  target: string;
  hit: boolean;
  killed: boolean;
  shrugged?: boolean;
  seed: number;
}

/**
 * Two other creatures fighting each other — the log's view of a battle the player is only
 * watching. Kept terser than the player's own combat: a war should read as a war, not bury the
 * player's own line in other people's blow-by-blow.
 */
export function narrateBystanderAttack(attack: BystanderAttack): string {
  const values = { attacker: attack.attacker, target: attack.target };
  if (!attack.hit) return fill(pickPhrase(BYSTANDER_MISS, attack.seed), values);
  if (attack.shrugged) return fill(pickPhrase(BYSTANDER_SHRUGGED, attack.seed), values);
  if (attack.killed) return fill(pickPhrase(BYSTANDER_KILL, attack.seed), values);
  return fill(pickPhrase(BYSTANDER_HIT, attack.seed), values);
}
