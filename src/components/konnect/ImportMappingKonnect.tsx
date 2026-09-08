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
import * as XLSX from "xlsx";

/**
 * Télécharger le modèle du mapping, et le réimporter rempli (lot C).
 *
 * POURQUOI CE N'EST PAS UNE ROUTE. Konnect expose bien
 * `POST /cabinet/config/mapping/import`, mais cette route est gardée : depuis que
 * le Dashboard est propriétaire du catalogue, elle répond 409 dès que le pont est
 * actif. L'import doit donc se faire ici, sur `KonnectExamens`.
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

/** Structurel : la page garde son propre type, on n'impose pas d'import croisé. */
export type LigneMappingImportable = {
  codeExamen: string;
  libelle: string | null;
  codeExamenClient: string;
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  reservableEnLigne: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  listeAttenteActive: boolean;
};

/**
 * En-têtes du modèle. Ce sont eux que le client voit dans son tableur, donc ils
 * sont en français et sans jargon. `CLE` n'est pas modifiable : c'est notre code.
 */
const CLE = "Code NEURACORP";
const COLONNES = {
  examen: "Examen",
  codeRis: "Code RIS",
  codeRisInjection: "Code RIS avec injection",
  typeRis: "Type RIS",
  libelleClient: "Libellé affiché au patient",
  performed: "Proposé au patient",
  reservable: "Réservable en ligne",
  ordoOblig: "Ordonnance obligatoire",
  injecte: "Injecté",
  listeAttente: "Liste d'attente",
} as const;

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
export default function ImportMappingKonnect<T extends LigneMappingImportable>({
  lignes,
  onAppliquer,
}: {
  lignes: T[];
  onAppliquer: (lignes: T[]) => void;
}) {
  const champFichier = useRef<HTMLInputElement>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function telechargerModele() {
    const donnees = lignes.map((l) => ({
      [CLE]: l.codeExamen,
      [COLONNES.examen]: l.libelle ?? "",
      [COLONNES.codeRis]: l.codeExamenClient,
      [COLONNES.codeRisInjection]: l.codeExamenInjection,
      [COLONNES.typeRis]: l.typeExamenClient,
      [COLONNES.libelleClient]: l.libelleClient,
      [COLONNES.performed]: oui(l.performed),
      [COLONNES.reservable]: oui(l.reservableEnLigne),
      [COLONNES.ordoOblig]: oui(l.ordoOblig),
      [COLONNES.injecte]: oui(l.examenInjecte),
      [COLONNES.listeAttente]: oui(l.listeAttenteActive),
    }));
    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Examens");
    XLSX.writeFile(classeur, "mapping-examens.xlsx");
  }

  async function importer(fichier: File) {
    setErreur(null);
    try {
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
      const colonnesManquantes = Object.values(COLONNES).filter(
        (c) => c !== COLONNES.examen && !entetes.includes(c)
      );

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
        misAJour.set(code, {
          ...base,
          codeExamenClient: entetes.includes(COLONNES.codeRis)
            ? versTexte(brute[COLONNES.codeRis], base.codeExamenClient)
            : base.codeExamenClient,
          codeExamenInjection: entetes.includes(COLONNES.codeRisInjection)
            ? versTexte(brute[COLONNES.codeRisInjection], base.codeExamenInjection)
            : base.codeExamenInjection,
          typeExamenClient: entetes.includes(COLONNES.typeRis)
            ? versTexte(brute[COLONNES.typeRis], base.typeExamenClient)
            : base.typeExamenClient,
          libelleClient: entetes.includes(COLONNES.libelleClient)
            ? versTexte(brute[COLONNES.libelleClient], base.libelleClient)
            : base.libelleClient,
          performed: entetes.includes(COLONNES.performed)
            ? versBooleen(brute[COLONNES.performed], base.performed)
            : base.performed,
          reservableEnLigne: entetes.includes(COLONNES.reservable)
            ? versBooleen(brute[COLONNES.reservable], base.reservableEnLigne)
            : base.reservableEnLigne,
          ordoOblig: entetes.includes(COLONNES.ordoOblig)
            ? versBooleen(brute[COLONNES.ordoOblig], base.ordoOblig)
            : base.ordoOblig,
          examenInjecte: entetes.includes(COLONNES.injecte)
            ? versBooleen(brute[COLONNES.injecte], base.examenInjecte)
            : base.examenInjecte,
          listeAttenteActive: entetes.includes(COLONNES.listeAttente)
            ? versBooleen(brute[COLONNES.listeAttente], base.listeAttenteActive)
            : base.listeAttenteActive,
        });
      }

      const fusionnees = lignes.map((l) => misAJour.get(l.codeExamen) ?? l);

      // Le `PUT` refuse deux examens sur le même code RIS, et il a raison : Konnect
      // ne saurait pas lequel appliquer. Le dire ici évite un refus sec au moment
      // d'enregistrer, quand l'utilisateur ne saura plus quelle ligne du fichier
      // l'a causé.
      const vus = new Map<string, string>();
      const conflits: string[] = [];
      for (const l of fusionnees) {
        const c = l.codeExamenClient.trim();
        if (!c || !l.performed) continue;
        const premier = vus.get(c);
        if (premier !== undefined) conflits.push(`${c} (${premier} et ${l.codeExamen})`);
        else vus.set(c, l.codeExamen);
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
          onClick={telechargerModele}
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
