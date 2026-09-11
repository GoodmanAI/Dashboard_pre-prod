"use client";

import React, { useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { IconDownload, IconUpload } from "@tabler/icons-react";
/**
 * Télécharger le modèle du mapping, et le réimporter rempli.
 *
 * SERT LES DEUX PRODUITS (LyraeKonnect depuis le 08/09/2026, LyraeTalk depuis le
 * 11/09/2026). Il vivait sous `components/konnect/`, ce qui devenait trompeur : dans
 * ce workspace « Konnect » est le nom d'une brique, pas d'un composant d'écran.
 *
 * POURQUOI CE N'EST PAS UNE ROUTE. Konnect expose bien
 * `POST /cabinet/config/mapping/import`, mais cette route est gardée : depuis que
 * le Dashboard est propriétaire du catalogue, elle répond 409 dès que le pont est
 * actif. L'import doit donc se faire ici, sur l'écran.
 *
 * CÔTÉ LYRAETALK IL N'Y A JAMAIS EU DE ROUTE D'IMPORT DU TOUT : le mapping s'y
 * saisissait ligne à ligne, 287 fois, pour chaque nouveau centre.
 *
 * Et il se fait **dans le navigateur, sans écrire**. Le fichier est rapproché des
 * lignes affichées, le rapport est montré, et rien n'est enregistré tant que
 * l'utilisateur n'a pas cliqué sur « Enregistrer » dans la barre du bas. Un import
 * qui écrirait directement priverait le client de la seule chose qui compte :
 * voir ce qui va changer avant que ça change. La validation serveur du `PUT`
 * (doublons de code NEURACORP, deux examens sur le même code RIS) reste le dernier
 * mot ; ce qui est fait ici l'anticipe pour donner un message utile plus tôt.
 *
 * LA CLÉ DE RAPPROCHEMENT EST LE CODE NEURACORP, et lui seul. C'est la seule
 * colonne que le client ne saisit pas : elle identifie la ligne de notre
 * référentiel. Une ligne du fichier dont le code est inconnu est rejetée et
 * nommée dans le rapport, jamais créée : le catalogue vient du référentiel, on
 * n'y ajoute pas d'examen par un tableur.
 */

/**
 * `xlsx` est chargé À LA DEMANDE, jamais à l'ouverture de la page.
 *
 * En import statique, la librairie pèse ~140 ko et part dans le bundle initial :
 * l'écran de mapping est passé de 8,8 ko à 150 ko au premier déploiement, soit
 * 338 ko de JS pour afficher un tableau. Or presque personne n'importe de fichier,
 * et ceux qui le font attendent volontiers une demi-seconde de plus. Ce sont des
 * secrétaires, parfois sur des postes anciens : la page qu'on ouvre tous les jours
 * doit rester légère, pas celle qu'on utilise une fois.
 */
async function chargerXlsx() {
  return import("xlsx");
}

/** Structurel : la page garde son propre type, on n'impose pas d'import croisé. */
/**
 * Le SEUL contrat commun aux deux produits : un code de notre référentiel, et un
 * libellé pour que le client reconnaisse la ligne dans son tableur.
 *
 * ⚠️ RIEN D'AUTRE N'EST COMMUN, et c'est le piège qu'il a fallu défaire. Ce type
 * exigeait autrefois `reservableEnLigne`, `ordoOblig`, `examenInjecte` et
 * `listeAttenteActive`, qui n'existent que chez LyraeKonnect ; le composant se disait
 * générique tout en étant figé sur un seul produit. Et le code d'injection ne porte
 * même pas le même nom des deux côtés : `codeExamenInjection` chez Konnect,
 * `codeExamenClientInject` chez LyraeTalk.
 *
 * Les colonnes sont donc DÉCRITES PAR L'APPELANT (`champs`), qui seul sait comment
 * elles s'appellent chez lui.
 */
export type LigneMappingImportable = {
  codeExamen: string;
  libelle: string | null;
};

/**
 * Une colonne du tableau, telle que le client la voit et telle qu'elle se range.
 *
 * `colonne` est l'en-tête affiché dans le tableur : en français, sans jargon, c'est
 * ce que le client lit. `cle` est le champ de SA ligne à lui. `type` dit comment
 * interpréter la cellule au retour.
 */
export type ChampMapping<T> = {
  colonne: string;
  cle: keyof T & string;
  type: "texte" | "booleen";
};

/**
 * `CLE` n'est pas modifiable : c'est notre code de référentiel, et c'est lui qui relie
 * chaque ligne du fichier à un examen. `COLONNE_EXAMEN` est un repère de lecture pour
 * le client, jamais réimporté.
 *
 * Les deux sont communs aux produits ; tout le reste vient de `champs`.
 */
const CLE = "Code NEURACORP";
const COLONNE_EXAMEN = "Examen";

/** Les colonnes de LyraeKonnect. Passées par sa page, gardées ici par commodité. */
export const CHAMPS_KONNECT = [
  { colonne: "Code RIS", cle: "codeExamenClient", type: "texte" },
  { colonne: "Code RIS avec injection", cle: "codeExamenInjection", type: "texte" },
  { colonne: "Type RIS", cle: "typeExamenClient", type: "texte" },
  { colonne: "Libellé affiché au patient", cle: "libelleClient", type: "texte" },
  { colonne: "Proposé au patient", cle: "performed", type: "booleen" },
  { colonne: "Réservable en ligne", cle: "reservableEnLigne", type: "booleen" },
  { colonne: "Ordonnance obligatoire", cle: "ordoOblig", type: "booleen" },
  { colonne: "Injecté", cle: "examenInjecte", type: "booleen" },
  { colonne: "Liste d'attente", cle: "listeAttenteActive", type: "booleen" },
] as const;

/**
 * Les colonnes de LyraeTalk : le strict nécessaire au mapping (décision du
 * 11/09/2026). Les synonymes, l'interrogatoire, le commentaire et la configuration
 * horaire restent à l'écran : ce sont des listes et des objets, qu'un tableur rend
 * pénibles à remplir et faciles à corrompre.
 *
 * « Attribué à Lyrae » et non « Proposé au patient » : chez LyraeTalk, `performed`
 * veut dire que le centre confie cet examen au robot. Même champ, autre sens, autre
 * mot.
 */
export const CHAMPS_TALK = [
  { colonne: "Code RIS", cle: "codeExamenClient", type: "texte" },
  { colonne: "Code RIS avec injection", cle: "codeExamenClientInject", type: "texte" },
  { colonne: "Type RIS", cle: "typeExamenClient", type: "texte" },
  { colonne: "Libellé affiché au patient", cle: "libelleClient", type: "texte" },
  { colonne: "Attribué à Lyrae", cle: "performed", type: "booleen" },
] as const;

type Rapport = {
  lues: number;
  modifiees: number;
  inchangees: number;
  inconnues: string[];
  conflits: string[];
  colonnesManquantes: string[];
};

/**
 * Oui / non tolérant : le fichier revient d'un tableur, rempli à la main, parfois
 * par plusieurs personnes. « Oui », « X », « 1 », « vrai » disent tous la même
 * chose. Une cellule vide ou incomprise laisse la valeur en place plutôt que de la
 * remettre à « non » : c'est le même principe que la fusion du `PUT`.
 */
function versBooleen(brut: unknown, actuel: boolean): boolean {
  if (typeof brut === "boolean") return brut;
  if (typeof brut === "number") return brut !== 0;
  if (typeof brut !== "string") return actuel;
  const v = brut.trim().toLowerCase();
  if (v === "") return actuel;
  if (["oui", "o", "x", "1", "vrai", "true", "yes"].includes(v)) return true;
  if (["non", "n", "0", "faux", "false", "no"].includes(v)) return false;
  return actuel;
}

function versTexte(brut: unknown, actuel: string): string {
  if (brut === null || brut === undefined) return actuel;
  const v = String(brut).trim();
  // Une cellule vide ne vide pas la valeur : pour effacer un code, on le fait dans
  // l'écran. Un tableur rend trop facile l'effacement involontaire d'une colonne.
  return v === "" ? actuel : v;
}

function oui(v: boolean): string {
  return v ? "Oui" : "Non";
}

/**
 * Générique sur la ligne de l'appelant : la page porte des colonnes que l'import
 * ne touche pas (`typeExamen`, le type de notre référentiel). Les figer ici les
 * ferait disparaître à chaque import, en silence.
 */
export default function ImportExportMapping<T extends LigneMappingImportable>({
  lignes,
  champs,
  onAppliquer,
}: {
  lignes: T[];
  /** Les colonnes de CE produit. Voir `CHAMPS_KONNECT` / `CHAMPS_TALK`. */
  champs: readonly ChampMapping<T>[];
  onAppliquer: (lignes: T[]) => void;
}) {
  const champFichier = useRef<HTMLInputElement>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function telechargerModele() {
    const XLSX = await chargerXlsx();
    const donnees = lignes.map((l) => {
      const ligne: Record<string, string> = {
        [CLE]: l.codeExamen,
        [COLONNE_EXAMEN]: l.libelle ?? "",
      };
      for (const c of champs) {
        const v = l[c.cle];
        ligne[c.colonne] = c.type === "booleen" ? oui(Boolean(v)) : String(v ?? "");
      }
      return ligne;
    });
    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Examens");
    XLSX.writeFile(classeur, "mapping-examens.xlsx");
  }

  async function importer(fichier: File) {
    setErreur(null);
    try {
      const XLSX = await chargerXlsx();
      const buffer = await fichier.arrayBuffer();
      const classeur = XLSX.read(buffer, { type: "array" });
      const feuille = classeur.Sheets[classeur.SheetNames[0]];
      if (!feuille) {
        setErreur("Le fichier ne contient aucune feuille lisible.");
        return;
      }
      const brutes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, {
        defval: "",
      });
      if (brutes.length === 0) {
        setErreur("Le fichier est vide.");
        return;
      }

      const entetes = Object.keys(brutes[0]);
      if (!entetes.includes(CLE)) {
        setErreur(
          `La colonne « ${CLE} » est absente. Partez du modèle : c'est elle qui relie chaque ligne à son examen.`
        );
        return;
      }
      // Les colonnes absentes ne sont pas une erreur : on n'importe que ce qui est
      // là. On le dit quand même, sinon un fichier tronqué passe pour complet.
      const colonnesManquantes = champs
        .map((c) => c.colonne)
        .filter((c) => !entetes.includes(c));

      const parCode = new Map(lignes.map((l) => [l.codeExamen, l]));
      const inconnues: string[] = [];
      const misAJour = new Map<string, T>();

      for (const brute of brutes) {
        const code = String(brute[CLE] ?? "").trim();
        if (code === "") continue;
        const actuelle = parCode.get(code);
        if (!actuelle) {
          inconnues.push(code);
          continue;
        }
        const base = misAJour.get(code) ?? actuelle;
        // Une colonne absente du fichier laisse la valeur en place : on n'importe que
        // ce qui est là. Un fichier tronqué ne doit pas effacer le reste.
        const maj: Record<string, unknown> = {};
        for (const c of champs) {
          if (!entetes.includes(c.colonne)) continue;
          const actuel = base[c.cle];
          maj[c.cle] =
            c.type === "booleen"
              ? versBooleen(brute[c.colonne], Boolean(actuel))
              : versTexte(brute[c.colonne], String(actuel ?? ""));
        }
        misAJour.set(code, { ...base, ...(maj as Partial<T>) });
      }

      const fusionnees = lignes.map((l) => misAJour.get(l.codeExamen) ?? l);

      // DEUX EXAMENS SUR LE MÊME CODE RIS, et le produit ne saurait pas lequel
      // appliquer. Konnect le refuse à l'enregistrement ; LyraeTalk, lui, l'accepte en
      // base mais le robot se retrouve avec deux examens indiscernables au téléphone.
      // Le dire ICI vaut mieux dans les deux cas : au moment d'enregistrer,
      // l'utilisateur ne saurait plus quelle ligne du fichier l'a causé.
      //
      // Le code RIS et « attribué » sont les deux seuls champs que ce contrôle
      // suppose, et les deux produits les ont. On les lit par leur description plutôt
      // que par un nom en dur, faute de quoi ce bloc rendrait le composant à nouveau
      // spécifique à un produit.
      const cleCodeRis = champs.find((c) => c.colonne === "Code RIS")?.cle;
      const cleAttribue = champs.find((c) => c.type === "booleen")?.cle;
      const vus = new Map<string, string>();
      const conflits: string[] = [];
      if (cleCodeRis) {
        for (const l of fusionnees) {
          const c = String(l[cleCodeRis] ?? "").trim();
          // Un examen non attribué ne part pas au RIS : deux d'entre eux peuvent
          // porter le même code sans conséquence.
          if (!c || (cleAttribue && !l[cleAttribue])) continue;
          const premier = vus.get(c);
          if (premier !== undefined) conflits.push(`${c} (${premier} et ${l.codeExamen})`);
          else vus.set(c, l.codeExamen);
        }
      }

      const modifiees = fusionnees.filter(
        (l, i) => JSON.stringify(l) !== JSON.stringify(lignes[i])
      ).length;

      setRapport({
        lues: brutes.length,
        modifiees,
        inchangees: misAJour.size - modifiees,
        inconnues,
        conflits,
        colonnesManquantes,
      });

      // Rien n'est enregistré : l'écran passe en « modifications non enregistrées »,
      // et l'utilisateur relit avant de valider. Un import en conflit n'est pas
      // appliqué du tout, sinon on lui laisserait un état qu'il ne peut pas sauver.
      if (conflits.length === 0) onAppliquer(fusionnees);
    } catch {
      setErreur("Fichier illisible. Attendu : un classeur .xlsx ou un .csv.");
    }
  }

  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<IconDownload size={16} />}
          onClick={() => void telechargerModele()}
          sx={{ textTransform: "none", whiteSpace: "nowrap" }}
        >
          Télécharger le tableau
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<IconUpload size={16} />}
          onClick={() => champFichier.current?.click()}
          sx={{ textTransform: "none", whiteSpace: "nowrap" }}
        >
          Importer un fichier
        </Button>
        <input
          ref={champFichier}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            // On remet le champ à zéro : sans ça, réimporter le même fichier après
            // correction ne déclenche aucun événement.
            e.target.value = "";
            if (f) void importer(f);
          }}
        />
      </Stack>

      {erreur && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      <Dialog open={rapport !== null} onClose={() => setRapport(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Résultat de l&apos;import</DialogTitle>
        <DialogContent>
          {rapport && (
            <Stack spacing={1.5}>
              <Typography sx={{ fontSize: 13.5 }}>
                {rapport.lues} ligne{rapport.lues > 1 ? "s" : ""} lue
                {rapport.lues > 1 ? "s" : ""} dans le fichier.
              </Typography>

              {rapport.conflits.length > 0 ? (
                <Alert severity="error">
                  <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
                    Rien n&apos;a été appliqué.
                  </Typography>
                  Le même code RIS est attribué à deux examens différents. Corrigez le
                  fichier et réimportez-le.
                  <Typography sx={{ fontSize: 12.5, mt: 1 }}>
                    {rapport.conflits.slice(0, 5).join(" · ")}
                    {rapport.conflits.length > 5
                      ? ` et ${rapport.conflits.length - 5} autre(s)`
                      : ""}
                  </Typography>
                </Alert>
              ) : (
                <Alert severity={rapport.modifiees > 0 ? "success" : "info"}>
                  {rapport.modifiees > 0
                    ? `${rapport.modifiees} examen${
                        rapport.modifiees > 1 ? "s" : ""
                      } modifié${rapport.modifiees > 1 ? "s" : ""}, ${
                        rapport.inchangees
                      } déjà à jour. Rien n'est encore enregistré : relisez le tableau, puis cliquez sur Enregistrer.`
                    : "Aucune différence avec ce qui est déjà en place."}
                </Alert>
              )}

              {rapport.inconnues.length > 0 && (
                <Alert severity="warning">
                  <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
                    {rapport.inconnues.length} ligne
                    {rapport.inconnues.length > 1 ? "s" : ""} ignorée
                    {rapport.inconnues.length > 1 ? "s" : ""}
                  </Typography>
                  Ces codes ne sont pas dans notre référentiel. On n&apos;ajoute pas
                  d&apos;examen par le tableau : dites-le nous et nous le complétons.
                  <Typography sx={{ fontSize: 12.5, mt: 1, fontFamily: "monospace" }}>
                    {rapport.inconnues.slice(0, 8).join(", ")}
                    {rapport.inconnues.length > 8
                      ? ` … et ${rapport.inconnues.length - 8} autre(s)`
                      : ""}
                  </Typography>
                </Alert>
              )}

              {rapport.colonnesManquantes.length > 0 && (
                <Alert severity="info">
                  Colonnes absentes du fichier, laissées telles quelles :{" "}
                  {rapport.colonnesManquantes.join(", ")}.
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRapport(null)} sx={{ textTransform: "none" }}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
