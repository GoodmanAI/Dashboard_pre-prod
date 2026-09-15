/**
 * Le classeur du pack de configuration : le construire, et le relire (lot 4D).
 *
 * ## Un seul fichier, une feuille par domaine
 *
 * Le pack porte tout ce qui se configure chez un centre. En CSV il faudrait huit
 * fichiers, qu'on se transmettrait par mail et qu'on mélangerait. Un classeur `.xlsx`
 * en fait un seul objet, et chaque onglet se remplit par la personne qui le connaît :
 * le secrétariat remplit les examens, l'administrateur remplit le reste.
 *
 * ## Ce module ne sait rien de la configuration
 *
 * Il traduit entre un classeur et des tableaux de lignes, rien d'autre. Ce qu'on met
 * dans les feuilles est décidé par `domaines.ts`, et ce qui est écrit en base l'est par
 * les routes existantes. C'est ce découpage qui permet d'ajouter un domaine sans
 * toucher au format.
 *
 * ## `xlsx` est chargé à la demande
 *
 * Même raison que sur l'écran de mapping : la librairie pèse environ 140 ko, et l'écran
 * de mapping était passé de 8,8 ko à 150 ko le jour où elle a été importée en statique.
 * Presque personne n'exporte un pack ; ceux qui le font attendent volontiers une
 * demi-seconde.
 */

export type Cellule = string | number | boolean | null;
export type Ligne = Record<string, Cellule>;

/** Une feuille du classeur : son onglet, ses colonnes, ses lignes. */
export type Feuille = {
  /** Le nom de l'onglet, tel que le lecteur le voit. */
  nom: string;
  /**
   * Les en-têtes, dans l'ordre voulu.
   *
   * On les impose au lieu de les déduire des lignes : une feuille vide n'a aucune
   * ligne dont déduire ses colonnes, et un pack exporté d'un centre neuf est
   * précisément le cas où l'on a besoin de voir les colonnes à remplir.
   */
  colonnes: string[];
  lignes: Ligne[];
};

async function chargerXlsx() {
  return import("xlsx");
}

/**
 * Excel refuse un nom d'onglet de plus de 31 caractères, ou contenant `: \ / ? * [ ]`.
 *
 * Le coupable silencieux : `book_append_sheet` lève, et l'export entier échoue sur un
 * nom de domaine un peu long. On tronque ici plutôt que de contraindre les libellés.
 */
export function nomOngletValide(nom: string): string {
  const propre = nom.replace(/[:\\/?*[\]]/g, " ").trim();
  return propre.length > 31 ? propre.slice(0, 31) : propre || "Feuille";
}

/** Construit le classeur et le fait télécharger par le navigateur. */
export async function telechargerClasseur(feuilles: Feuille[], nomFichier: string): Promise<void> {
  const XLSX = await chargerXlsx();
  const classeur = XLSX.utils.book_new();
  const nomsPris = new Set<string>();

  for (const f of feuilles) {
    // `header` garantit l'ordre ET la présence des colonnes même sans aucune ligne.
    const feuille = XLSX.utils.json_to_sheet(f.lignes, { header: f.colonnes });
    let nom = nomOngletValide(f.nom);
    // Deux domaines tronqués au même nom écraseraient le premier onglet sans rien dire.
    let n = 2;
    while (nomsPris.has(nom)) {
      const suffixe = ` ${n++}`;
      nom = nomOngletValide(nom.slice(0, 31 - suffixe.length) + suffixe);
    }
    nomsPris.add(nom);
    XLSX.utils.book_append_sheet(classeur, feuille, nom);
  }

  XLSX.writeFile(classeur, nomFichier);
}

/**
 * Relit un classeur et rend ses feuilles, indexées par nom d'onglet.
 *
 * `defval: ""` est délibéré : sans lui, une cellule vide est ABSENTE de l'objet, et on
 * ne peut plus distinguer « colonne absente du fichier » de « cellule laissée vide ».
 * Or les deux se traitent pareil ici (on ne touche à rien), mais le rapport doit savoir
 * le dire à l'utilisateur, sinon un fichier tronqué passe pour complet.
 */
export async function lireClasseur(fichier: File): Promise<Map<string, Feuille>> {
  const XLSX = await chargerXlsx();
  const buffer = await fichier.arrayBuffer();
  const classeur = XLSX.read(buffer, { type: "array" });
  const feuilles = new Map<string, Feuille>();

  for (const nom of classeur.SheetNames) {
    const brute = classeur.Sheets[nom];
    if (!brute) continue;
    const lignes = XLSX.utils.sheet_to_json<Ligne>(brute, { defval: "" });
    // Les en-têtes se lisent sur la PREMIÈRE ligne du fichier, pas sur les clés du
    // premier objet : un onglet sans aucune ligne a des colonnes, et les perdre ferait
    // croire à un onglet vide de toute structure.
    const entetes = XLSX.utils.sheet_to_json<string[]>(brute, { header: 1 })[0] ?? [];
    feuilles.set(nom, {
      nom,
      colonnes: entetes.map((c) => String(c ?? "").trim()).filter(Boolean),
      lignes,
    });
  }
  return feuilles;
}

/**
 * Oui / non tolérant, repris tel quel de l'import du mapping.
 *
 * Le fichier revient d'un tableur rempli à la main, parfois par plusieurs personnes.
 * « Oui », « X », « 1 », « vrai » disent la même chose. Une cellule vide ou incomprise
 * **laisse la valeur en place** : c'est la règle du pack, une cellule vide n'efface
 * jamais.
 */
export function versBooleen(brut: Cellule | undefined, actuel: boolean): boolean {
  if (typeof brut === "boolean") return brut;
  if (typeof brut === "number") return brut !== 0;
  if (typeof brut !== "string") return actuel;
  const v = brut.trim().toLowerCase();
  if (v === "") return actuel;
  if (["oui", "o", "x", "1", "vrai", "true", "yes"].includes(v)) return true;
  if (["non", "n", "0", "faux", "false", "no"].includes(v)) return false;
  return actuel;
}

/** Texte tolérant : une cellule vide laisse la valeur en place. */
export function versTexte(brut: Cellule | undefined, actuel: string): string {
  if (brut === null || brut === undefined) return actuel;
  const v = String(brut).trim();
  return v === "" ? actuel : v;
}

/**
 * Texte d'une cellule, sans repli sur une valeur existante.
 *
 * Sert aux feuilles en LISTE (les sites, les examens), où une ligne du fichier n'a pas
 * toujours de ligne en face : il n'y a alors aucune valeur actuelle sur quoi se replier.
 */
export function texteBrut(brut: Cellule | undefined): string {
  if (brut === null || brut === undefined) return "";
  return String(brut).trim();
}

export function oui(v: boolean | null | undefined): string {
  return v ? "Oui" : "Non";
}
