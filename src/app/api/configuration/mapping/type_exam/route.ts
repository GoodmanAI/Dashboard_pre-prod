// app/api/configuration/mapping/type_exam/route.ts

import { NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { rejectIfSecretary } from "@/lib/authGuards";
import {
  EXAM_TYPES,
  LIBELLE_STOCKE,
  indexerParType,
  diminutifDuType,
  type ExamType,
} from "@/lib/examTypes";

/**
 * Correspondance « type d'examen canonique → code court du centre » (diminutif).
 * -----------------------------------------------------------------------------
 * L'IDENTITÉ D'UNE LIGNE EST SON `examCode`, jamais sa position dans la table.
 *
 * Ce garde-fou n'est pas théorique. L'ancien écran de saisie déduisait le
 * libellé de la POSITION de la ligne (`code == 0 ? "Echographie" : ... : "Scanner"`).
 * Au premier chargement d'un centre neuf, cette route renvoie les valeurs par
 * défaut, dont les clés sont "US"/"MG"/"RX"/"MR"/"CT" : aucune n'est égale à 0,
 * 1, 2 ni 3, donc les CINQ lignes tombaient dans le dernier `else` et étaient
 * enregistrées avec `fr = "Scanner"`. Résultat constaté sur le groupe Quimper
 * (userProductId 18) le 2026-09-04 : six rendez-vous, quatre mammographies et
 * deux échographies, tous affichés « Scanner » dans la liste des appels.
 *
 * Conséquences sur ce fichier :
 *   - le GET renvoie TOUJOURS un objet clé par code canonique, jamais un
 *     tableau de lignes dont l'ordre dépendrait de PostgreSQL ;
 *   - le POST n'accepte du client QUE le `diminutif`. `fr` et `labelFr` sont
 *     dérivés du code canonique côté serveur, donc ils ne peuvent plus dériver.
 */

type LigneMapping = { fr: string; diminutif: string };

/**
 * Le mapping complet d'un centre, indexé par code canonique.
 *
 * `indexerParType` retrouve le type d'une ligne même si son `examCode` est hors
 * nomenclature : le script de provisionnement de Pontivy y a mis le code du RIS
 * (`DX`) et le code canonique dans `labelFr`. Sans cette recuperation, la radio
 * de ce centre ressortait avec le diminutif par defaut `RX` au lieu de `DX`, et
 * l'enregistrer aurait ecrase la vraie valeur.
 */
function construireMapping(
  lignes: Array<{ examCode: string; fr: string; labelFr: string; diminutif: string | null }>
): Record<ExamType, LigneMapping> {
  const parType = indexerParType(lignes);

  return EXAM_TYPES.reduce((acc, code) => {
    acc[code] = {
      fr: LIBELLE_STOCKE[code],
      // Défaut = le code canonique lui-même. Un centre qui n'a rien saisi
      // utilise donc les codes standards, ce qui est le cas le plus courant.
      diminutif: diminutifDuType(parType, code),
    };
    return acc;
  }, {} as Record<ExamType, LigneMapping>);
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const url = new URL(req.url);
  const userProductId = url.searchParams.get("userProductId");

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId" },
      { status: 400 }
    );
  }

  const id = Number(userProductId);

  const ownershipErr = await assertUserProductOwnership(session, id);
  if (ownershipErr) return ownershipErr;

  const mappings = await prisma.examMapping.findMany({
    where: { userProductId: id },
    // `fr` et `labelFr` sont lus pour retrouver le type d'une ligne dont
    // l'`examCode` serait hors nomenclature, pas pour l'afficher.
    select: { examCode: true, fr: true, labelFr: true, diminutif: true },
  });

  // Toujours les cinq types, toujours dans le même ordre, que la table soit
  // vide, partielle ou complète. L'appelant n'a plus à distinguer les cas.
  return NextResponse.json(construireMapping(mappings));
}

export async function POST(req: Request) {
  const secretaryErr = await rejectIfSecretary();
  if (secretaryErr) return secretaryErr;

  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const url = new URL(req.url);
  const userProductId = url.searchParams.get("userProductId");

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId" },
      { status: 400 }
    );
  }

  const id = Number(userProductId);

  const ownershipErr = await assertUserProductOwnership(session, id);
  if (ownershipErr) return ownershipErr;

  const data = await req.json();

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json(
      { error: "Le corps attendu est un objet { US: { diminutif }, ... }" },
      { status: 400 }
    );
  }

  // Un corps dont aucune clé n'est un code canonique vient d'un appelant qui
  // n'a pas été mis à jour (l'ancien écran postait des index "0".."4"). On
  // refuse, plutôt que d'écraser la configuration du centre par des défauts.
  const reconnues = EXAM_TYPES.filter((code) => (data as any)[code] != null);
  if (reconnues.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun type d'examen reconnu. Les clés attendues sont US, MG, RX, MR et CT.",
      },
      { status: 400 }
    );
  }

  // Seul le diminutif vient du client. `fr` et `labelFr` sont dérivés du code
  // canonique côté serveur : ils ne peuvent plus se désaligner du type.
  const lignes = EXAM_TYPES.map((code) => {
    const diminutif = String((data as any)[code]?.diminutif ?? "")
      .trim()
      .toUpperCase();
    return {
      userProductId: id,
      examCode: code,
      fr: LIBELLE_STOCKE[code],
      labelFr: code,
      diminutif: diminutif || code,
    };
  });

  // Remplacement complet des cinq lignes, dans une transaction : un échec en
  // cours de route laissait auparavant le centre SANS aucun mapping.
  await prisma.$transaction([
    prisma.examMapping.deleteMany({ where: { userProductId: id } }),
    prisma.examMapping.createMany({ data: lignes }),
  ]);

  return NextResponse.json({ success: true });
}
