/** Ne conserve que les champs fournis et réellement changés, dates comprises. */
export function champsChanges<T extends object>(avant: T, apres: Partial<T>, cles: readonly (keyof T)[]) {
  const precedent: Partial<T> = {};
  const suivant: Partial<T> = {};
  const valeur = (v: unknown) => v instanceof Date ? v.getTime() : v;
  for (const cle of cles) {
    if (apres[cle] !== undefined && valeur(avant[cle]) !== valeur(apres[cle])) {
      precedent[cle] = avant[cle];
      suivant[cle] = apres[cle];
    }
  }
  return { avant: precedent, apres: suivant };
}
