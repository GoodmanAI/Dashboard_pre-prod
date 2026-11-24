/**
 * Un nombre et son nom, accordés. Les écrans disent « 1 site », « 3 sites »,
 * jamais « 3 site(s) ». À zéro, `zero` donne une phrase entière si fournie.
 */
export function compter(n: number, singulier: string, pluriel = `${singulier}s`, zero?: string): string {
  if (n === 0 && zero) return zero;
  return `${n} ${n > 1 ? pluriel : singulier}`;
}
