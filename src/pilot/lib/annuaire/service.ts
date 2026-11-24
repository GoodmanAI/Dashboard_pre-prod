import { lireCorpsBorne, USER_AGENT_GEOCODAGE } from "@/pilot/lib/carte/geocoder";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { HOTE_ANNUAIRE, identifiantSaisi, lireReponse, motsDeRepli, parametresRecherche, type Entreprise } from "./regles";

/** Le service répond d'ordinaire en moins d'une seconde ; au-delà, on rend la main. */
export const DELAI_ANNUAIRE_MS = 8_000;
const TAILLE_MAX = 2 * 1024 * 1024;

/**
 * L'annuaire est coupé pendant les tests et quand PILOT_ANNUAIRE=0 (serveur de
 * vérification, poste sans réseau) : aucun appel ne part, l'écran le dit.
 */
export function annuaireActif(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "test" && env.PILOT_ANNUAIRE !== "0";
}

export type Appel = (parametres: URLSearchParams) => Promise<unknown>;

/** Un appel au service, sur un hôte fixe, avec délai. Lève une ErreurMetier lisible, sans jamais citer la recherche. */
export const appelerAnnuaire: Appel = async (parametres) => {
  let reponse: Response;
  try {
    reponse = await fetch(`${HOTE_ANNUAIRE}/search?${parametres}`, {
      headers: { "User-Agent": USER_AGENT_GEOCODAGE, Accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(DELAI_ANNUAIRE_MS),
    });
  } catch {
    throw new ErreurMetier("L'annuaire des entreprises ne répond pas. Réessayez dans un instant.", 502);
  }
  if (reponse.status === 429) {
    await reponse.body?.cancel().catch(() => undefined);
    throw new ErreurMetier("L'annuaire limite le nombre de recherches. Patientez quelques secondes, puis relancez.", 429);
  }
  if (!reponse.ok) {
    await reponse.body?.cancel().catch(() => undefined);
    throw new ErreurMetier("L'annuaire des entreprises ne répond pas. Réessayez dans un instant.", 502);
  }
  const texte = await lireCorpsBorne(reponse, TAILLE_MAX).catch(() => null);
  try { return texte === null ? null : JSON.parse(texte) as unknown; }
  catch { return null; }
};

export type ResultatAnnuaire = { entreprises: Entreprise[]; note: string | null };

/**
 * Cherche par nom, SIREN ou SIRET. Sans résultat pour un nom, refait la
 * recherche sur ses mots porteurs dans le secteur santé, et le dit. Une
 * entreprise dont tous les établissements ouverts n'ont pas été listés est
 * relue par son SIREN, pour que la liste des sites soit complète.
 */
export async function chercherDansAnnuaire(q: string, appel: Appel = appelerAnnuaire): Promise<ResultatAnnuaire> {
  const saisie = q.trim();
  if (saisie.length < 2) throw new ErreurMetier("Saisissez un nom, un SIREN ou un SIRET.", 400);
  if (appel === appelerAnnuaire && !annuaireActif()) throw new ErreurMetier("L'annuaire est coupé sur ce serveur (PILOT_ANNUAIRE=0).", 503);
  let entreprises = lireReponse(await appel(parametresRecherche(saisie)));
  let note: string | null = null;
  if (!entreprises.length && !identifiantSaisi(saisie)) {
    for (const mot of motsDeRepli(saisie)) {
      entreprises = lireReponse(await appel(parametresRecherche(mot, { sante: true })));
      if (entreprises.length) { note = `Rien pour « ${saisie} ». Voici les résultats approchants pour « ${mot} », dans la santé. Vérifiez l'orthographe.`; break; }
    }
  }
  return { entreprises, note };
}

/** Une entreprise relue par son SIREN, avec tous ses établissements ouverts. */
export async function lireEntreprise(siren: string, appel: Appel = appelerAnnuaire): Promise<Entreprise> {
  if (!/^\d{9}$/.test(siren)) throw new ErreurMetier("SIREN invalide.", 400);
  if (appel === appelerAnnuaire && !annuaireActif()) throw new ErreurMetier("L'annuaire est coupé sur ce serveur (PILOT_ANNUAIRE=0).", 503);
  const trouvee = lireReponse(await appel(parametresRecherche(siren))).find((e) => e.siren === siren);
  if (!trouvee) throw new ErreurMetier("Cette entreprise n'est plus dans l'annuaire.", 404);
  // Une recherche par SIREN ne liste pas les établissements : le service ne les rend que pour une recherche par nom.
  if (trouvee.etablissements.length >= trouvee.etablissementsOuverts) return trouvee;
  const parNom = lireReponse(await appel(parametresRecherche(trouvee.denomination))).find((e) => e.siren === siren);
  if (!parNom) return trouvee;
  const vus = new Set(trouvee.etablissements.map((e) => e.siret));
  const etablissements = [...trouvee.etablissements, ...parNom.etablissements.filter((e) => !vus.has(e.siret))]
    .sort((a, b) => Number(b.estSiege) - Number(a.estSiege) || (a.codePostal ?? "").localeCompare(b.codePostal ?? ""));
  return { ...trouvee, etablissements, dirigeants: trouvee.dirigeants.length ? trouvee.dirigeants : parNom.dirigeants };
}
