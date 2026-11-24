import { TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
import { z } from "zod";
import { CrmEtapeCommerciale, CrmTypeOrganisation, type CrmContact, type CrmOrganisation, type Prisma } from "@prisma/client";
import { ANCIENS_LIBELLES, LIBELLES } from "@/pilot/lib/pipeline";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { compter } from "@/pilot/lib/texte";

export const COLONNES = ["cle", "nom", "type", "etape", "responsable_email", "chef_de_projet_email", "ris", "nombre_sites",
  "contact_nom", "contact_fonction", "contact_email", "contact_telephone", "dernier_echange_le", "notes"] as const;
const normaliser = (s: string) => s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
export type LigneCsv = { ligne: number; valeurs: Record<string, string>; erreur?: string };
export type Refus = { ligne: number; cle?: string; raison: string };
export type RapportImport = { creees: number; misesAJour: number; inchangees: number; refusees: Refus[];
  avertissements: Array<{ ligne: number; cle: string; message: string }> };

export class ErreurCsv extends Error {}

/** RFC 4180. ligne est le numéro physique du début du record, même avec des sauts cités. */
export function lireCsv(texte: string): LigneCsv[] {
  const source = texte.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let cite = false, virgules = 0, pointsVirgules = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"') {
      if (cite && source[i + 1] === '"') i++;
      else cite = !cite;
    } else if (!cite) {
      if (source[i] === "\n") break;
      if (source[i] === ";") pointsVirgules++;
      if (source[i] === ",") virgules++;
    }
  }
  const separateur = pointsVirgules >= virgules ? ";" : ",";
  const records: Array<{ ligne: number; champs: string[] }> = [];
  let champs: string[] = [], champ = "", ligne = 1, debut = 1, apresCitation = false;
  cite = false;
  function finirChamp() { champs.push(champ); champ = ""; apresCitation = false; }
  function finirLigne() {
    finirChamp();
    if (champs.some((c) => c.trim() !== "")) records.push({ ligne: debut, champs });
    champs = [];
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (cite) {
      if (c === '"') {
        if (source[i + 1] === '"') { champ += '"'; i++; }
        else { cite = false; apresCitation = true; }
      } else { champ += c; if (c === "\n") ligne++; }
    } else if (c === separateur) finirChamp();
    else if (c === "\n") { finirLigne(); ligne++; debut = ligne; }
    else if (c === '"' && champ === "" && !apresCitation) cite = true;
    else {
      if (c === '"' || apresCitation) throw new ErreurCsv("Ligne " + ligne + " : guillemets CSV invalides.");
      champ += c;
    }
  }
  if (cite) throw new ErreurCsv("Ligne " + debut + " : guillemets CSV non fermés.");
  finirLigne();
  if (!records.length) throw new ErreurCsv("En-tête CSV absent.");
  const entete = records.shift()!;
  const noms = entete.champs.map((c) => normaliser(c).replace(/ /g, "_"));
  if (noms.some((c) => !COLONNES.includes(c as typeof COLONNES[number]))) {
    throw new ErreurCsv("Colonne inconnue. Colonnes acceptées : " + COLONNES.join(", ") + ".");
  }
  if (new Set(noms).size !== noms.length) throw new ErreurCsv("En-tête CSV : colonne répétée.");
  for (const cle of ["cle", "nom"]) if (!noms.includes(cle)) throw new ErreurCsv("En-tête CSV : colonne " + cle + " obligatoire.");
  return records.map((r) => ({ ligne: r.ligne, valeurs: Object.fromEntries(noms.map((n, i) => [n, (r.champs[i] ?? "").trim()])),
    ...(r.champs.length !== noms.length ? { erreur: "Nombre de colonnes différent de l'en-tête." } : {}) }));
}

function code<T extends string>(valeur: string, codes: readonly T[], libelles: Record<T, string>) {
  return codes.find((c) => normaliser(c) === normaliser(valeur) || normaliser(libelles[c]) === normaliser(valeur));
}
const types = TYPES_ORGANISATION;
const texteOptionnel = z.string().max(200).optional();
const email = z.string().email("Adresse e-mail invalide.").max(200).transform((v) => v.toLowerCase()).optional();
const dateCsv = z.string().transform((v, ctx) => {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  const canonique = iso ? v : fr ? fr[3] + "-" + fr[2] + "-" + fr[1] : "";
  const date = new Date(canonique);
  if (!canonique || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== canonique) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date attendue : AAAA-MM-JJ ou JJ/MM/AAAA." });
    return z.NEVER;
  }
  return date;
}).optional();
const schema = z.object({
  cle: z.string({ required_error: "Clé obligatoire." }).min(1).max(200),
  nom: z.string({ required_error: "Nom obligatoire." }).min(1).max(200),
  type: z.string().transform((v, ctx) => {
    const resultat = code(v, Object.values(CrmTypeOrganisation), types);
    if (resultat) return resultat;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Type d'organisation inconnu." }); return z.NEVER;
  }).optional(),
  etape: z.string().transform((v, ctx) => {
    // Les anciens noms restent reconnus : un fichier préparé avant C-54 passe encore.
    const resultat = code(v, Object.values(CrmEtapeCommerciale), LIBELLES) ?? code(v, Object.values(CrmEtapeCommerciale), ANCIENS_LIBELLES);
    if (!resultat) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Étape inconnue." }); return z.NEVER; }
    if (["PERDU", "EN_SOMMEIL", "ARRETE"].includes(resultat)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Étape de sortie : à poser dans Pilot avec sa raison." }); return z.NEVER;
    }
    return resultat;
  }).default("PROSPECT"),
  responsable_email: email, chef_de_projet_email: email, ris: texteOptionnel,
  nombre_sites: z.string().regex(/^\d+$/, "Entier positif attendu.").transform(Number)
    .pipe(z.number().int().positive("Entier positif attendu.").max(2147483647)).optional(),
  contact_nom: texteOptionnel, contact_fonction: texteOptionnel, contact_email: email,
  contact_telephone: texteOptionnel, dernier_echange_le: dateCsv, notes: z.string().max(5000).optional(),
}).strict();
type DonneesLigne = z.output<typeof schema>;
export function validerLigne(ligne: LigneCsv): { valide: true; donnees: DonneesLigne } | { valide: false; refus: Refus } {
  const refuser = (raison: string) => ({ valide: false as const, refus: { ligne: ligne.ligne, cle: ligne.valeurs.cle || undefined,
    raison: "Ligne " + ligne.ligne + " : " + raison } });
  if (ligne.erreur) return refuser(ligne.erreur);
  const valeurs = Object.fromEntries(Object.entries(ligne.valeurs).filter(([, v]) => v !== ""));
  const resultat = schema.safeParse(valeurs);
  if (!resultat.success) return refuser(resultat.error.issues.map((e) => e.path.join(".") + " : " + e.message).join(" "));
  return { valide: true, donnees: resultat.data };
}

/** « 3 créées, 1 mise à jour, 2 refusées » : le même texte pour le journal et le script. */
export function resumerImport(r: RapportImport) {
  return [compter(r.creees, "créée"), compter(r.misesAJour, "mise à jour", "mises à jour"), compter(r.refusees.length, "refusée")].join(", ");
}

/** Validation complète avant écriture. Une case vide ne remplace jamais une valeur existante. */
export async function importer(texte: string, { auteurId, essai = false }: { auteurId: number | null; essai?: boolean }): Promise<RapportImport> {
  const rapport: RapportImport = { creees: 0, misesAJour: 0, inchangees: 0, refusees: [], avertissements: [] };
  const valides: Array<{ ligne: LigneCsv; d: DonneesLigne }> = [];
  const cles = new Set<string>();
  for (const ligne of lireCsv(texte)) {
    const validation = validerLigne(ligne);
    if (!validation.valide) { rapport.refusees.push(validation.refus); continue; }
    const d = validation.donnees;
    if (cles.has(d.cle)) {
      rapport.refusees.push({ ligne: ligne.ligne, cle: d.cle, raison: "Ligne " + ligne.ligne + " : cle répétée dans le fichier." }); continue;
    }
    cles.add(d.cle); valides.push({ ligne, d });
  }
  if (!valides.length) return rapport;
  return transactionJournalisee(async (tx) => {
    // Paramètres séparés du SQL : aucune interpolation de valeurs dans les requêtes.
    await tx.$queryRawUnsafe("SELECT 1 FROM pg_advisory_xact_lock(72104, 0)");
    const noms = valides.map(({ d }) => d.nom);
    const emails = valides.flatMap(({ d }) => [d.responsable_email, d.chef_de_projet_email]).filter((v): v is string => !!v);
    await tx.$queryRawUnsafe('SELECT id FROM "CrmOrganisation" WHERE "importCle" = ANY($1::text[]) OR lower("raisonSocialeNom") = ANY($2::text[]) ORDER BY id FOR UPDATE',
      [...cles], noms.map((v) => v.toLowerCase()));
    const [utilisateurs, parCle, parNom] = await Promise.all([
      tx.user.findMany({ where: { OR: emails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })) },
        select: { id: true, email: true, role: true } }),
      tx.crmOrganisation.findMany({ where: { importCle: { in: [...cles] } } }),
      tx.crmOrganisation.findMany({ where: { OR: noms.map((n) => ({ raisonSocialeNom: { equals: n, mode: "insensitive" as const } })) } }),
    ]);
    const comptes = new Map(utilisateurs.map((u) => [u.email.toLowerCase(), u]));
    const existantes = new Map(parCle.map((o) => [o.importCle!, o]));
    const nomsOccupes = new Set([...parCle, ...parNom].map((o) => o.raisonSocialeNom.toLowerCase()));
    const contacts = await tx.crmContact.findMany({ where: { organisationId: { in: parCle.map((o) => o.id) } }, orderBy: { id: "asc" } });
    const maintenant = new Date();
    for (const { ligne, d } of valides) {
      let refus: string | undefined;
      for (const colonne of ["responsable_email", "chef_de_projet_email"] as const) {
        const adresse = d[colonne], compte = adresse ? comptes.get(adresse) : undefined;
        if (adresse && (!compte || compte.role === "CLIENT")) refus = colonne + " : compte interne inconnu.";
      }
      const courante = existantes.get(d.cle);
      // Le type ne se devine pas : un hôpital rangé en cabinet fausserait les filtres.
      if (!courante && !d.type) refus = "type : obligatoire pour créer une organisation.";
      if (!courante && nomsOccupes.has(d.nom.toLowerCase())) refus = "nom : Une organisation porte déjà ce nom. Ajoutez sa clé dans Pilot ou changez le nom.";
      if (refus) { rapport.refusees.push({ ligne: ligne.ligne, cle: d.cle, raison: "Ligne " + ligne.ligne + " : " + refus }); continue; }
      if (essai) rapport.avertissements.push({ ligne: ligne.ligne, cle: d.cle, message: "Essai : aucune écriture." });
      if (courante && ligne.valeurs.etape && courante.etape !== d.etape) {
        rapport.avertissements.push({ ligne: ligne.ligne, cle: d.cle, message: "Étape ignorée : elle se change dans Pilot." });
      }
      const valeurs: Prisma.CrmOrganisationUncheckedCreateInput = {
        raisonSocialeNom: d.nom, type: (d.type ?? courante?.type)!,
        ...(d.responsable_email ? { responsableId: comptes.get(d.responsable_email)!.id } : {}),
        ...(d.chef_de_projet_email ? { chefDeProjetId: comptes.get(d.chef_de_projet_email)!.id } : {}),
        ...(d.ris !== undefined ? { ris: d.ris } : {}),
        ...(d.nombre_sites !== undefined ? { nombreSites: d.nombre_sites } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.dernier_echange_le && (!courante?.dernierEchangeLe || d.dernier_echange_le > courante.dernierEchangeLe) ? { dernierEchangeLe: d.dernier_echange_le } : {}),
      };
      const change = (a: unknown, b: unknown) => (a instanceof Date ? a.toISOString() : a) !== (b instanceof Date ? b.toISOString() : b);
      let modifiee = !!courante && Object.entries(valeurs).some(([cle, valeur]) => change(courante[cle as keyof CrmOrganisation], valeur));
      let organisationId: number;
      if (!courante) {
        const nouvelle = { ...valeurs, importCle: d.cle, etape: d.etape, etapeDepuisLe: maintenant };
        organisationId = essai ? -ligne.ligne : (await tx.crmOrganisation.create({ data: nouvelle })).id;
        nomsOccupes.add(d.nom.toLowerCase());
        rapport.creees++;
      } else {
        organisationId = courante.id;
        if (modifiee && !essai) await tx.crmOrganisation.update({ where: { id: courante.id }, data: valeurs });
      }
      // Un renommage accepté réserve aussi le nom pour les lignes suivantes du fichier.
      nomsOccupes.add(d.nom.toLowerCase());
      if (d.contact_nom) {
        const dansOrganisation = contacts.filter((c) => c.organisationId === organisationId);
        const contact = (d.contact_email ? dansOrganisation.find((c) => c.email?.toLowerCase() === d.contact_email) : undefined)
          ?? dansOrganisation.find((c) => c.nom.toLowerCase() === d.contact_nom!.toLowerCase());
        const donneesContact = { nom: d.contact_nom, principal: true,
          ...(d.contact_fonction !== undefined ? { fonction: d.contact_fonction } : {}),
          ...(d.contact_email !== undefined ? { email: d.contact_email } : {}),
          ...(d.contact_telephone !== undefined ? { telephone: d.contact_telephone } : {}) };
        const autresPrincipaux = dansOrganisation.filter((c) => c.principal && c.id !== contact?.id);
        const changeContact = !contact || autresPrincipaux.length > 0 ||
          Object.entries(donneesContact).some(([cle, valeur]) => change(contact[cle as keyof CrmContact], valeur));
        modifiee ||= changeContact;
        if (changeContact && !essai) {
          if (autresPrincipaux.length) await tx.crmContact.updateMany({ where: { id: { in: autresPrincipaux.map((c) => c.id) } }, data: { principal: false } });
          if (contact) await tx.crmContact.update({ where: { id: contact.id }, data: donneesContact });
          else await tx.crmContact.create({ data: { ...donneesContact, organisationId } });
        }
      }
      if (courante) { if (modifiee) rapport.misesAJour++; else rapport.inchangees++; }
    }
    if (rapport.creees + rapport.misesAJour + rapport.inchangees && !essai) await journaliser(tx, { type: "IMPORT_EXECUTE", auteurId,
      resume: `Import CSV : ${resumerImport(rapport)}`,
      apres: { creees: rapport.creees, misesAJour: rapport.misesAJour, inchangees: rapport.inchangees, refusees: rapport.refusees.length } });
    return rapport;
  }, { timeout: 120000 });
}
