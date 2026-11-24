/**
 * L'argent se compte en centimes, jamais en flottant. Toutes les colonnes
 * `*Centimes` du schéma suivent cette règle, et rien ne les convertit avant
 * l'affichage.
 */

const FORMAT_EURO = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const FORMAT_EURO_PRECIS = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function euros(centimes: number): string {
  return FORMAT_EURO.format(centimes / 100);
}

export function eurosPrecis(centimes: number): string {
  return FORMAT_EURO_PRECIS.format(centimes / 100);
}

/** Arrondi au centime, pour une pondération par probabilité. */
export function pondere(centimes: number, probabilite: number): number {
  return Number((BigInt(centimes) * BigInt(probabilite) + 50n) / 100n);
}

export function entierDepuisSaisie(saisie: string, decimales: number, champ: string): number {
  const valeur = saisie.trim();
  const motif = new RegExp(`^(?:[0-9]+|[0-9]{1,3}(?:[ \\u00a0\\u202f][0-9]{3})+)(?:[,.][0-9]{1,${decimales}})?$`);
  if (!motif.test(valeur)) throw new Error(`Vérifiez le champ « ${champ} ».`);
  const [entier, fraction = ""] = valeur.replace(/[ \u00a0\u202f]/g, "").split(/[,.]/);
  const resultat = Number(BigInt(entier) * BigInt(10 ** decimales) + BigInt(fraction.padEnd(decimales, "0")));
  if (!Number.isSafeInteger(resultat)) throw new Error(`Vérifiez le champ « ${champ} ».`);
  return resultat;
}
export const centimesDepuisSaisie = (saisie: string) => entierDepuisSaisie(saisie, 2, "Montant en euros");

/**
 * Un montant en centimes, écrit comme on le saisit : « 1050,50 », sans espace
 * ni symbole, toujours deux décimales. Le contraire exact de
 * `centimesDepuisSaisie`, pour préremplir un champ. Arithmétique entière.
 */
export function saisieEuros(centimes: number): string {
  const absolu = Math.abs(centimes);
  const reste = absolu % 100;
  return (centimes < 0 ? "-" : "") + (absolu - reste) / 100 + "," + String(reste).padStart(2, "0");
}

/**
 * Un montant en centimes, écrit court pour un champ : « 12 » pour des euros
 * ronds, « 12,50 » sinon, sans espace ni symbole. Relu par
 * `centimesDepuisSaisie`. Arithmétique entière : la division ne porte que sur
 * un multiple de 100.
 */
export function eurosCourts(centimes: number): string {
  const absolu = Math.abs(centimes);
  const reste = absolu % 100;
  return (centimes < 0 ? "-" : "") + (absolu - reste) / 100 + (reste ? "," + String(reste).padStart(2, "0") : "");
}
