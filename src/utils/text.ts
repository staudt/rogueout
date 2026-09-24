/** Small shared text helpers for building message-log lines. */

/** "rat" -> "a rat", "ogre" -> "an ogre". Proper names (NPCs) should not go through this. */
export function withArticle(name: string): string {
  // The explicit empty check matters: `'aeiou'.includes('')` is true, so a nameless thing would
  // otherwise come out as "an ".
  const first = name.charAt(0).toLowerCase();
  const article = first !== '' && 'aeiou'.includes(first) ? 'an' : 'a';
  return `${article} ${name}`;
}

/** "a rat" / "a rat and a goblin" / "a rat, a goblin and Old Maren". */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
