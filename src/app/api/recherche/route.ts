export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserAccess } from "@/lib/auth-helpers";
import { hasPermission, PAGES, PageKey } from "@/lib/permissions";
import { cheminCentre } from "@/lib/cheminsCentre";
import { produitsDuCentre } from "@/lib/produitsDuCentre";
import { chercher, type Resultat } from "@/lib/recherche/moteur";
import { CATALOGUE } from "@/lib/recherche/catalogue";
import { chercherEtage2, etage2Disponible } from "@/lib/recherche/etage2";

/**
 * Recherche centrale de l'espace client (plan `2026-10-recherche-centrale-dashboard.md`).
 *
 * POST /api/recherche  { userId, phrase }
 *
 * `userId` est le client regardé (celui de l'URL `/client/c/{userId}/…`), contrôlé par
 * `assertUserAccess` comme partout : un admin dans la vue d'un client, une secrétaire
 * chez elle. Les droits viennent de la session, jamais de la phrase (R0 bis) :
 *   - une fiche n'est notée que si le compte lit sa page ;
 *   - `modifiable` dit si le compte y écrit (le panneau montera l'écran en lecture sinon) ;
 *   - une fiche d'un produit que le client n'a pas n'est pas notée.
 *
 * Étage 1 (catalogue, sans modèle) d'abord. Étage 2 (Azure OpenAI, `etage2.ts`) seulement
 * si l'étage 1 ne trouve rien et ne refuse rien ; s'il est coupé ou en panne, la réponse
 * le dit (`etage2: "indisponible"`) et la barre l'affiche.
 *
 * La barre ne lit aucune donnée ici : elle rend des destinations et des filtres. Les
 * données (appels, listes) sont chargées par l'écran monté, avec ses propres gardes.
 *
 * Journal : une ligne `recherche` par appel, **sans la phrase** (elle peut porter un nom
 * de patient), avec ce qu'il faut pour compter les recherches sans résultat (lot 4).
 */

const LONGUEUR_MAX = 300;
const PAGES_CONNUES = new Set<string>(Object.values(PAGES));

export type ResultatRecherche = Omit<Resultat, "score" | "page"> & {
  href: string;
  modifiable: boolean;
  userProductId: number;
};

export type ReponseRecherche = {
  etage: 1 | 2;
  etage2?: "indisponible";
  resultats: ResultatRecherche[];
  ignores: string[];
  refus?: "action" | "hors_perimetre";
};

export async function POST(req: NextRequest) {
  const debut = Date.now();
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const corps = await req.json().catch(() => null);
  const userId = Number(corps?.userId);
  const phrase = typeof corps?.phrase === "string" ? corps.phrase.trim() : "";
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (!phrase) {
    return NextResponse.json({ error: "Écrivez ce que vous cherchez." }, { status: 400 });
  }
  if (phrase.length > LONGUEUR_MAX) {
    return NextResponse.json(
      { error: `La recherche est trop longue (${LONGUEUR_MAX} caractères au plus). Raccourcissez-la.` },
      { status: 400 }
    );
  }

  const accesErr = await assertUserAccess(session, userId);
  if (accesErr) return accesErr;

  const produits = await produitsDuCentre(userId);
  const affiliation = new Map(produits.map((p) => [p.slug, p.userProductId]));

  const fiches = CATALOGUE.filter((f) => {
    if (!PAGES_CONNUES.has(f.page)) {
      console.error(`[recherche] fiche ${f.cle} : page de droit inconnue « ${f.page} »`);
      return false;
    }
    return affiliation.has(f.produit) && hasPermission(session.user, f.page as PageKey, "read");
  });

  const reponse = chercher(phrase, fiches);
  let etage: 1 | 2 = 1;
  let etage2: "indisponible" | undefined;
  if (!reponse.resultats.length && !reponse.refus) {
    const llm = etage2Disponible() ? await chercherEtage2(phrase, fiches) : null;
    const fiche = llm?.cle ? fiches.find((f) => f.cle === llm.cle) : undefined;
    if (!llm) etage2 = "indisponible";
    else etage = 2;
    if (fiche && llm) {
      reponse.resultats = [
        { cle: fiche.cle, produit: fiche.produit, page: fiche.page, libelle: fiche.libelle, genre: fiche.genre, score: 0, filtres: llm.filtres },
      ];
    }
  }

  const resultats: ResultatRecherche[] = reponse.resultats.map(({ score: _score, page, ...r }) => {
    const [chemin, ancre] = r.cle.split("#");
    const sousChemin = chemin.split("/").slice(1).join("/");
    return {
      ...r,
      href: cheminCentre(userId, r.produit, sousChemin) + (ancre ? `#${ancre}` : ""),
      modifiable: hasPermission(session.user, page as PageKey, "write"),
      userProductId: affiliation.get(r.produit)!,
    };
  });

  console.log(
    JSON.stringify({
      recherche: true,
      etage,
      etage2: etage2 ?? null,
      actorId: session.user.id,
      userId,
      resultats: resultats.length,
      premier: resultats[0]?.cle ?? null,
      refus: reponse.refus ?? null,
      ignores: reponse.ignores,
      dureeMs: Date.now() - debut,
    })
  );

  const sortie: ReponseRecherche = { etage, etage2, resultats, ignores: reponse.ignores, refus: reponse.refus };
  return NextResponse.json(sortie, { headers: { "Cache-Control": "no-store" } });
}
