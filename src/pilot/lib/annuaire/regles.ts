/**
 * L'annuaire des entreprises (C-89) : ce qu'on demande au service public
 * Recherche d'entreprises (INSEE Sirene et Registre national des entreprises)
 * et ce qu'on garde de sa réponse. Pur, sans réseau : `service.ts` appelle,
 * ce fichier traduit. Repris du calculateur des apporteurs (MLO), sans son
 * détour par le navigateur : Pilot appelle depuis son serveur, en un clic.
 */

export const HOTE_ANNUAIRE = "https://recherche-entreprises.api.gouv.fr";
/** Nombre de résultats montrés pour une recherche par nom. */
export const RESULTATS_PAR_PAGE = 10;
/** Établissements lus par entreprise : un groupe de radiologie dépasse rarement la trentaine. */
export const ETABLISSEMENTS_MAX = 100;

/** Les formes juridiques qu'on rencontre dans le parc. Un code absent s'affiche tel quel. */
export const FORMES_JURIDIQUES: Record<string, string> = {
  "5785": "SELAS", "5485": "SELARL", "5585": "SELAFA", "5385": "SELCA", "5710": "SAS", "5720": "SASU",
  "5499": "SARL", "5498": "EURL", "5599": "SA à conseil d'administration", "5699": "SA à directoire", "6220": "GIE",
  "6540": "SCI", "6585": "SCP", "6589": "SCM", "7364": "Établissement d'hospitalisation", "7361": "Centre communal d'action sociale",
  "9220": "Association déclarée", "1000": "Entrepreneur individuel",
};

/** Les activités de santé utiles au parc. Un code absent s'affiche tel quel. */
export const ACTIVITES: Record<string, string> = {
  "86.10Z": "Activités hospitalières", "86.21Z": "Médecine générale", "86.22A": "Radiodiagnostic et radiothérapie",
  "86.22B": "Activités chirurgicales", "86.22C": "Autres médecins spécialistes", "86.90B": "Laboratoires d'analyses médicales",
  "86.90F": "Autres activités de santé humaine", "70.10Z": "Activités des sièges sociaux", "64.20Z": "Activités des sociétés holding",
  "68.20B": "Location de terrains et d'autres biens immobiliers",
};

export const formeJuridique = (code: string | null): string | null => code ? FORMES_JURIDIQUES[code] ?? code : null;
export const libelleActivite = (code: string | null): string | null => code ? (ACTIVITES[code] ? `${code} ${ACTIVITES[code]}` : code) : null;
/** Un établissement de santé : la section 86 de la nomenclature. Ceux-là sont proposés comme centres. */
export const estSante = (code: string | null) => /^86\./.test(code ?? "");

export type Etablissement = {
  siret: string; nom: string | null; adresse: string | null; codePostal: string | null; ville: string | null;
  activite: string | null; finess: string | null; estSiege: boolean;
};
export type Dirigeant = { nom: string; qualite: string | null };
export type Entreprise = {
  siren: string; nom: string; denomination: string; formeJuridique: string | null; activite: string | null;
  creeLe: string | null; etablissementsOuverts: number; siege: Etablissement | null;
  dirigeants: Dirigeant[]; etablissements: Etablissement[];
};

const MOTS_LIAISON = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "en", "sur", "sous", "aux", "au", "et", "à"]);

/** « 10 RUE DU PALAIS » devient « 10 Rue du Palais ». Les mots de liaison restent en minuscules. */
export function casseTitre(texte: string): string {
  return texte.toLowerCase().replace(/[\p{L}\d]+/gu, (mot, i: number, tout: string) => {
    if (i > 0 && MOTS_LIAISON.has(mot) && tout[i - 1] !== "'") return mot;
    return mot.charAt(0).toUpperCase() + mot.slice(1);
  });
}

const chaine = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * La rue d'un établissement, sans le code postal ni la commune que le service
 * colle à la fin, ni le complément (« Chez M. X ») qui n'est pas une rue.
 */
export function rueSeule(e: { adresse?: unknown; code_postal?: unknown; libelle_commune?: unknown; complement_adresse?: unknown }): string | null {
  let rue = chaine(e.adresse);
  if (!rue) return null;
  const cp = chaine(e.code_postal), ville = chaine(e.libelle_commune), complement = chaine(e.complement_adresse);
  const suffixe = [cp, ville].filter(Boolean).join(" ");
  if (suffixe && rue.toUpperCase().endsWith(suffixe.toUpperCase())) rue = rue.slice(0, rue.length - suffixe.length).trim();
  if (complement && rue.toUpperCase().startsWith(complement.toUpperCase())) rue = rue.slice(complement.length).trim();
  return rue ? casseTitre(rue) : null;
}

function lireEtablissement(e: unknown): Etablissement | null {
  if (!e || typeof e !== "object") return null;
  const x = e as Record<string, unknown>;
  const siret = chaine(x.siret);
  if (!siret || !/^\d{14}$/.test(siret) || x.etat_administratif === "F") return null;
  const enseignes = Array.isArray(x.liste_enseignes) ? x.liste_enseignes.map(chaine).filter((v): v is string => !!v) : [];
  const finess = Array.isArray(x.liste_finess) ? x.liste_finess.map(chaine).filter((v): v is string => !!v) : [];
  const nom = enseignes[0] ?? chaine(x.nom_commercial);
  return {
    siret, nom: nom ? casseTitre(nom) : null, adresse: rueSeule(x), codePostal: chaine(x.code_postal),
    ville: chaine(x.libelle_commune) ? casseTitre(chaine(x.libelle_commune)!) : null,
    activite: chaine(x.activite_principale), finess: finess.length ? finess.join(", ").slice(0, 200) : null, estSiege: x.est_siege === true,
  };
}

function lireDirigeant(d: unknown): Dirigeant | null {
  if (!d || typeof d !== "object") return null;
  const x = d as Record<string, unknown>;
  const qualite = chaine(x.qualite);
  if (x.type_dirigeant === "personne morale") {
    const denomination = chaine(x.denomination);
    return denomination ? { nom: casseTitre(denomination), qualite } : null;
  }
  const nom = chaine(x.nom), prenom = chaine(x.prenoms)?.split(/\s+/)[0] ?? null;
  if (!nom) return null;
  return { nom: [prenom ? casseTitre(prenom) : null, nom.toUpperCase()].filter(Boolean).join(" "), qualite: qualite ? qualite.charAt(0).toUpperCase() + qualite.slice(1).toLowerCase() : null };
}

/**
 * La réponse du service, réduite à ce que Pilot garde. Tolérante : un champ
 * absent ou d'un autre type donne null, une entreprise sans SIREN valide est
 * écartée, un établissement fermé aussi. Rien n'est inventé.
 */
export function lireReponse(corps: unknown): Entreprise[] {
  const resultats = corps && typeof corps === "object" && Array.isArray((corps as { results?: unknown }).results) ? (corps as { results: unknown[] }).results : [];
  const entreprises: Entreprise[] = [];
  for (const r of resultats) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const siren = chaine(x.siren);
    if (!siren || !/^\d{9}$/.test(siren)) continue;
    const siege = lireEtablissement(x.siege ? { ...(x.siege as object), est_siege: true } : null);
    const vus = new Set<string>();
    const etablissements: Etablissement[] = [];
    for (const e of [...(Array.isArray(x.matching_etablissements) ? x.matching_etablissements : []), ...(siege ? [x.siege && { ...(x.siege as object), est_siege: true }] : [])]) {
      const lu = lireEtablissement(e);
      if (!lu || vus.has(lu.siret)) continue;
      vus.add(lu.siret);
      etablissements.push(lu);
    }
    // Le siège d'abord, puis par code postal.
    etablissements.sort((a, b) => Number(b.estSiege) - Number(a.estSiege) || (a.codePostal ?? "").localeCompare(b.codePostal ?? ""));
    const denomination = chaine(x.nom_raison_sociale) ?? chaine(x.nom_complet) ?? siren;
    entreprises.push({
      siren, nom: casseTitre(chaine(x.nom_complet) ?? denomination), denomination,
      formeJuridique: chaine(x.nature_juridique), activite: chaine(x.activite_principale), creeLe: chaine(x.date_creation),
      etablissementsOuverts: typeof x.nombre_etablissements_ouverts === "number" ? x.nombre_etablissements_ouverts : etablissements.length,
      siege, dirigeants: (Array.isArray(x.dirigeants) ? x.dirigeants : []).map(lireDirigeant).filter((d): d is Dirigeant => !!d).slice(0, 20),
      etablissements,
    });
  }
  return entreprises;
}

/** Un SIREN (9 chiffres) ou un SIRET (14) saisi avec ou sans espaces. */
export function identifiantSaisi(q: string): string | null {
  const chiffres = q.replace(/\s/g, "");
  return /^\d{9}$|^\d{14}$/.test(chiffres) ? chiffres : null;
}

/**
 * Les paramètres de la recherche. Un SIREN ou un SIRET cherche une seule
 * entreprise ; un nom en cherche dix. `sante` limite à la section Q (santé
 * humaine), le repli quand le nom exact ne donne rien.
 */
export function parametresRecherche(q: string, options: { sante?: boolean } = {}): URLSearchParams {
  const id = identifiantSaisi(q);
  return new URLSearchParams({
    q: id ?? q.trim().slice(0, 200), per_page: String(id ? 1 : RESULTATS_PAR_PAGE), minimal: "true",
    include: "siege,dirigeants,matching_etablissements", limite_matching_etablissements: String(ETABLISSEMENTS_MAX),
    ...(options.sante ? { section_activite_principale: "Q" } : {}),
  });
}

const MOTS_VIDES = /^(SAS|SASU|SARL|EURL|SELAS|SELARL|SELAFA|SCM|SCP|GIE|SA|DES|DU|LES|LA|LE|ET|AUX|CENTRE|CABINET|GROUPE|GROUP|HOLDING)$/i;
/** Les mots porteurs d'un nom, du plus long au plus court : le repli quand le nom entier ne donne rien. */
export function motsDeRepli(q: string): string[] {
  return q.split(/[\s,;'’\-/().]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.test(m)).sort((a, b) => b.length - a.length).slice(0, 3);
}

const jetons = (v: string | null) => (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const GENERIQUES = new Set(["RUE", "AVENUE", "BOULEVARD", "PLACE", "CHEMIN", "ROUTE", "ALLEE", "IMPASSE", "QUAI", "COURS", "PARC", "ZONE",
  "ACTIVITE", "ACTIVITES", "CENTRE", "RESIDENCE", "BATIMENT", "LIEU", "DIT", "AV", "BD", "BIS", "TER"]);

/**
 * Un centre déjà saisi et un établissement de l'annuaire sont le même lieu :
 * même code postal, même numéro de rue s'ils en ont un, et deux mots
 * significatifs en commun (un seul si l'une des adresses n'en a qu'un).
 * La règle du calculateur : on complète le centre au lieu d'en créer un second.
 */
export function memeLieu(centre: { codePostal: string | null; adresse: string | null }, e: Pick<Etablissement, "codePostal" | "adresse">): boolean {
  if (!centre.codePostal || centre.codePostal.replace(/\s/g, "") !== e.codePostal) return false;
  const a = jetons(centre.adresse), b = jetons(e.adresse);
  const na = a.find((m) => /^\d+$/.test(m)), nb = b.find((m) => /^\d+$/.test(m));
  if (na && nb && na !== nb) return false;
  const sig = (t: string[]) => new Set(t.filter((m) => m.length >= 4 && !GENERIQUES.has(m)));
  const sa = sig(a), sb = sig(b);
  let communs = 0;
  sa.forEach((m) => { if (sb.has(m)) communs++; });
  return communs >= 2 || (communs >= 1 && Math.min(sa.size, sb.size) <= 1);
}

/**
 * Le nom d'un centre né d'un établissement : son enseigne, sinon sa ville,
 * suivie de la rue quand deux établissements choisis partagent la ville.
 * Unique chez le client (contrainte en base) : un numéro départage le reste.
 */
export function nomsDesCentres(choisis: readonly Etablissement[], dejaPris: readonly string[]): string[] {
  const parVille = new Map<string, number>();
  for (const e of choisis) if (!e.nom) parVille.set(e.ville ?? "", (parVille.get(e.ville ?? "") ?? 0) + 1);
  const pris = new Set(dejaPris.map((n) => n.toLowerCase()));
  return choisis.map((e) => {
    let base = e.nom ?? e.ville ?? "Centre";
    if (!e.nom && (parVille.get(e.ville ?? "") ?? 0) > 1 && e.adresse) base = `${base}, ${e.adresse}`;
    base = base.slice(0, 190);
    let nom = base;
    for (let n = 2; pris.has(nom.toLowerCase()); n++) nom = `${base} (${n})`;
    pris.add(nom.toLowerCase());
    return nom;
  });
}

/** Un dirigeant déjà parmi les contacts : mêmes mots du nom, dans n'importe quel ordre. */
export function memePersonne(a: string, b: string): boolean {
  const cle = (v: string) => jetons(v).sort().join(" ");
  return cle(a) !== "" && cle(a) === cle(b);
}

/** Le métier proposé pour un dirigeant (C-88) : « Gérant » pour un gérant ou un président, sinon rien. */
export function metierDuDirigeant(qualite: string | null): string | null {
  return qualite && /g[ée]rant|pr[ée]sident|directeur g[ée]n[ée]ral/i.test(qualite) ? "Gérant" : null;
}
