// app/api/configuration/mapping/type_exam/route.ts

import { NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { rejectIfSecretary } from "@/lib/authGuards";

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

/** Les cinq types d'examen, dans l'ordre d'affichage. La clé fait foi. */
const EXAM_TYPES = ["US", "MG", "RX", "MR", "CT"] as const;
type ExamType = (typeof EXAM_TYPES)[number];

/**
 * Libellé français par code canonique.
 *
 * Ces libellés sont ceux que `examCodeMap` savait retraduire en code
 * (`configuration/route.ts`) : ne pas les remplacer par des variantes accentuées
 * ou plus longues sans mettre la table de retour à jour du même coup.
 */
const LIBELLE_PAR_TYPE: Record<ExamType, string> = {
  US: "Echographie",
  MG: "Mammographie",
  RX: "Radio",
  MR: "IRM",
  CT: "Scanner",
};

type LigneMapping = { fr: string; diminutif: string };

/** Le mapping complet d'un centre, indexé par code canonique. */
function construireMapping(
  lignes: Array<{ examCode: string; diminutif: string | null }>
): Record<ExamType, LigneMapping> {
  const parCode = new Map(lignes.map((l) => [l.examCode, l]));

  return EXAM_TYPES.reduce((acc, code) => {
    const ligne = parCode.get(code);
    acc[code] = {
      fr: LIBELLE_PAR_TYPE[code],
      // Défaut = le code canonique lui-même. Un centre qui n'a rien saisi
      // utilise donc les codes standards, ce qui est le cas le plus courant.
      diminutif: ligne?.diminutif?.trim() || code,
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
    select: { examCode: true, diminutif: true },
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
      fr: LIBELLE_PAR_TYPE[code],
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
