"use client";

import Retour from "@/components/shared/Retour";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { useDroitPage } from "@/hooks/useDroitPage";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";
import { PAGES } from "@/lib/permissions";

/**
 * Multi examens (18/09/2026) : ce qu'un patient qui a plusieurs examens peut réserver
 * en ligne sur le portail. Plan : `lyrae/plans/2026-09-konnect-demandes-bloquees.md`.
 *
 * LE VISUEL REPREND CELUI DE LYRAETALK (« Correspondance des multi-examens ») : un
 * tableau, une ligne par combinaison de types d'examens, un interrupteur. Le client
 * retrouve le même écran d'un produit à l'autre.
 *
 * CE QUI EST ENREGISTRÉ, dans le domaine `konnect.paires-examens` :
 *
 * - `combinaisons: [{ modalite_a, modalite_b, ecart_max_minutes, modalite_premiere }]`,
 *   paire rangée par ordre alphabétique des codes. Présente = réservable en ligne.
 *   `modalite_premiere` : la modalité à passer en premier, `null` pour peu importe.
 * - `exclusions: [{ code, libelle }]` : les examens que le centre sort du multi-examens,
 *   par code NEURACORP. Un panier qui en contient un part au rappel, combinaison cochée
 *   ou non. L'exception prime.
 *
 * CE QUI A ÉTÉ RETIRÉ LE 18/09/2026, à la demande du client : les réglages par paire
 * d'examens (`items`) et l'onglet des règles de coexistence. Ils se chevauchaient avec
 * les combinaisons et aucun n'était appliqué par le portail. Les valeurs déjà
 * enregistrées sous `items` sont renvoyées telles quelles, pour ne rien effacer sans le
 * dire ; le domaine `konnect.regles-coexistence` reste en base, sans écran.
 */

const DOMAINE = "konnect.paires-examens";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";

/** `dabord` : le libellé du choix d'ordre, avec son article. */
type Modalite = { code: string; nom: string; dabord: string };

const RADIO: Modalite = { code: "RX", nom: "Radio", dabord: "D'abord la radio" };
const ECHO: Modalite = { code: "US", nom: "Échographie", dabord: "D'abord l'échographie" };
const MAMMO: Modalite = { code: "MG", nom: "Mammographie", dabord: "D'abord la mammographie" };
const SCANNER: Modalite = { code: "CT", nom: "Scanner", dabord: "D'abord le scanner" };
const IRM: Modalite = { code: "MR", nom: "IRM", dabord: "D'abord l'IRM" };

/** Les quinze combinaisons, dans l'ordre de l'écran LyraeTalk. */
const COUPLES: [Modalite, Modalite][] = [
  [ECHO, MAMMO],
  [ECHO, RADIO],
  [ECHO, IRM],
  [ECHO, SCANNER],
  [ECHO, ECHO],
  [MAMMO, RADIO],
  [MAMMO, IRM],
  [MAMMO, SCANNER],
  [MAMMO, MAMMO],
  [RADIO, RADIO],
  [RADIO, IRM],
  [RADIO, SCANNER],
  [IRM, SCANNER],
  [IRM, IRM],
  [SCANNER, SCANNER],
];

const ECART_DEFAUT = 30;
const ECART_PLAFOND = 240;

type Reglage = { ecart: number; premiere: string | null };
type Exclusion = { code: string; libelle: string };
type ExamenCatalogue = { code: string; libelle: string; type: string | null };

/** La clé d'une combinaison, indépendante de l'ordre : « CT|MR ». */
function cle(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export default function MultiExamensKonnect() {
  const { raisonLectureSeule } = useDroitPage(PAGES.KONNECT_PAIRES);
  const { userProductId } = useCentreProduit();

  // Combinaisons cochées, par clé rangée. Absente = pas réservable en ligne.
  const [reglages, setReglages] = useState<Record<string, Reglage>>({});
  const [reglagesInitiaux, setReglagesInitiaux] = useState<Record<string, Reglage>>({});
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [exclusionsInitiales, setExclusionsInitiales] = useState<Exclusion[]>([]);
  // Les autres clés de la valeur (dont `items`), renvoyées telles quelles.
  const [autresCles, setAutresCles] = useState<Record<string, unknown>>({});
  const [catalogue, setCatalogue] = useState<ExamenCatalogue[]>([]);
  const [aAjouter, setAAjouter] = useState<ExamenCatalogue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const [rDomaine, rExamens] = await Promise.all([
          fetch(`/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`),
          fetch(`/api/konnect-examens?userProductId=${userProductId}`),
        ]);
        if (!rDomaine.ok) throw new Error();
        const d = await rDomaine.json();
        if (annule) return;

        const valeur = d?.valeur && typeof d.valeur === "object" ? d.valeur : {};
        const { combinaisons: brutes, exclusions: brutesExcl, ...reste } = valeur;
        setAutresCles(reste);

        const lus: Record<string, Reglage> = {};
        (Array.isArray(brutes) ? brutes : []).forEach((c: any) => {
          if (typeof c?.modalite_a !== "string" || typeof c?.modalite_b !== "string") return;
          const ecart = Number(c.ecart_max_minutes);
          lus[cle(c.modalite_a, c.modalite_b)] = {
            ecart: Number.isFinite(ecart) && ecart >= 0 && ecart <= ECART_PLAFOND ? ecart : ECART_DEFAUT,
            premiere: typeof c.modalite_premiere === "string" ? c.modalite_premiere : null,
          };
        });
        setReglages(lus);
        setReglagesInitiaux(lus);

        const excl: Exclusion[] = (Array.isArray(brutesExcl) ? brutesExcl : [])
          .filter((e: any) => typeof e?.code === "string" && e.code)
          .map((e: any) => ({ code: e.code, libelle: String(e.libelle ?? e.code) }));
        setExclusions(excl);
        setExclusionsInitiales(excl);

        if (rExamens.ok) {
          const dEx = await rExamens.json();
          const lignes: any[] = Array.isArray(dEx?.examens) ? dEx.examens : [];
          setCatalogue(
            lignes
              .filter((e) => e?.performed && String(e?.codeExamenClient ?? "").trim())
              .map((e) => ({
                code: String(e.codeExamen),
                libelle: String(e.libelle ?? e.codeExamen),
                type: e.typeExamen ?? null,
              }))
              .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"))
          );
        }
      } catch {
        if (!annule) setErreur("Impossible de charger le réglage multi examens.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    COUPLES.forEach(([a, b]) => {
      const k = cle(a.code, b.code);
      out[`combinaison:${k}`] = reglages[k] ?? null;
    });
    out.exclusions = exclusions.map((e) => e.code).sort();
    return out;
  }, [reglages, exclusions]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  const basculer = (k: string, actif: boolean) =>
    setReglages((prec) => {
      const suivant = { ...prec };
      if (actif) suivant[k] = prec[k] ?? { ecart: ECART_DEFAUT, premiere: null };
      else delete suivant[k];
      return suivant;
    });

  const modifier = (k: string, champ: Partial<Reglage>) =>
    setReglages((prec) => (prec[k] ? { ...prec, [k]: { ...prec[k], ...champ } } : prec));

  const examensAjoutables = useMemo(() => {
    const deja = new Set(exclusions.map((e) => e.code));
    return catalogue.filter((e) => !deja.has(e.code));
  }, [catalogue, exclusions]);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valeur: {
              ...autresCles,
              combinaisons: Object.entries(reglages).map(([k, r]) => {
                const [modalite_a, modalite_b] = k.split("|");
                return {
                  modalite_a,
                  modalite_b,
                  ecart_max_minutes: r.ecart,
                  modalite_premiere: modalite_a === modalite_b ? null : r.premiere,
                };
              }),
              exclusions,
            },
          }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      setReglagesInitiaux(reglages);
      setExclusionsInitiales(exclusions);
      marquerEnregistre();
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Multi examens" description="Plusieurs examens pour un même patient">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  const enTete = { fontSize: 12.5, fontWeight: 600, color: INK, bgcolor: "#F4F7F9" };

  return (
    <PageContainer title="Multi examens" description="Plusieurs examens pour un même patient">
      <Box>
        <SectionHeader
          title="Multi examens"
          subtitle="Ce qu'un patient qui a plusieurs examens peut réserver en ligne"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5, maxWidth: 780 }}>
          Activez les combinaisons qu&apos;un patient peut réserver ensemble. Il prend alors
          ses deux rendez-vous le même jour, dans le même centre, dans l&apos;ordre choisi et
          avec au plus l&apos;attente indiquée entre les deux. Pour une combinaison non
          activée, pour trois examens ou plus, ou pour un examen en exception, le patient
          laisse son numéro et la demande arrive dans vos demandes de rappel.
        </Typography>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ borderColor: BORDER, borderRadius: 2, mb: 1.5 }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={enTete}>Double examen</TableCell>
                <TableCell sx={enTete}>Réservable en ligne</TableCell>
                <TableCell sx={enTete}>Ordre</TableCell>
                <TableCell sx={enTete}>Attente au plus</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {COUPLES.map(([a, b]) => {
                const k = cle(a.code, b.code);
                const r = reglages[k];
                const memeType = a.code === b.code;
                return (
                  <TableRow key={k} hover>
                    <TableCell sx={{ fontSize: 13.5, color: INK, py: 1.25 }}>
                      {a.nom} + {b.nom}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={Boolean(r)}
                        onChange={(e) => basculer(k, e.target.checked)}
                        inputProps={{ "aria-label": `${a.nom} + ${b.nom} réservable en ligne` }}
                      />
                    </TableCell>
                    <TableCell>
                      {memeType ? (
                        <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>Peu importe</Typography>
                      ) : (
                        <Select
                          size="small"
                          value={r?.premiere ?? ""}
                          disabled={!r}
                          displayEmpty
                          onChange={(e) =>
                            modifier(k, { premiere: e.target.value ? String(e.target.value) : null })
                          }
                          sx={{ fontSize: 13, minWidth: 210 }}
                        >
                          <MenuItem value="">Peu importe</MenuItem>
                          <MenuItem value={a.code}>{a.dabord}</MenuItem>
                          <MenuItem value={b.code}>{b.dabord}</MenuItem>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={r ? r.ecart : ECART_DEFAUT}
                        disabled={!r}
                        onChange={(e) =>
                          modifier(k, {
                            ecart: Math.max(0, Math.min(ECART_PLAFOND, Number(e.target.value) || 0)),
                          })
                        }
                        inputProps={{ min: 0, max: ECART_PLAFOND, step: 5, "aria-label": "Minutes" }}
                        InputProps={{
                          endAdornment: (
                            <Typography sx={{ fontSize: 12, color: INK_MUTED, ml: 0.5 }}>min</Typography>
                          ),
                        }}
                        sx={{ width: 110 }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 4 }}>
          Deux examens avec injection, comme deux scanners injectés, passent toujours par le
          rappel : le portail ne sait pas encore espacer deux injections.
        </Typography>

        <Typography sx={{ fontSize: 15, fontWeight: 600, color: INK, mb: 0.5 }}>
          Exceptions
        </Typography>
        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 1.5, maxWidth: 780 }}>
          Un examen ajouté ici n&apos;est jamais réservé en ligne avec un autre, même si la
          combinaison est activée. Le patient qui le demande avec d&apos;autres examens laisse
          son numéro, et vous le rappelez. Seul, il reste réservable comme d&apos;habitude.
        </Typography>

        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
          <Autocomplete
            size="small"
            options={examensAjoutables}
            value={aAjouter}
            onChange={(_, e) => setAAjouter(e)}
            getOptionLabel={(e) => e.libelle}
            isOptionEqualToValue={(x, y) => x.code === y.code}
            noOptionsText="Aucun examen ne correspond."
            renderOption={(props, e) => (
              <li {...props} key={e.code}>
                <Box>
                  <Typography sx={{ fontSize: 13.5 }}>{e.libelle}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
                    {e.type ? `${e.type} · ` : ""}
                    {e.code}
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => <TextField {...params} placeholder="Chercher un examen" />}
            sx={{ flex: 1, minWidth: 260, maxWidth: 520 }}
          />
          <Button
            variant="outlined"
            startIcon={<IconPlus size={16} />}
            disabled={!aAjouter}
            onClick={() => {
              if (!aAjouter) return;
              setExclusions((prec) => [...prec, { code: aAjouter.code, libelle: aAjouter.libelle }]);
              setAAjouter(null);
            }}
            sx={{ textTransform: "none" }}
          >
            Ajouter l&apos;exception
          </Button>
        </Box>

        {exclusions.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: INK_MUTED }}>Aucune exception.</Typography>
        ) : (
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ borderColor: BORDER, borderRadius: 2, maxWidth: 780 }}
          >
            <Table size="small">
              <TableBody>
                {exclusions.map((e) => (
                  <TableRow key={e.code}>
                    <TableCell sx={{ fontSize: 13.5, color: INK }}>{e.libelle}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: INK_MUTED }}>{e.code}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label={`Retirer l'exception ${e.libelle}`}
                        onClick={() => setExclusions((prec) => prec.filter((x) => x.code !== e.code))}
                      >
                        <IconTrash size={17} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          blocage={raisonLectureSeule}
          onAnnuler={() => {
            setReglages(reglagesInitiaux);
            setExclusions(exclusionsInitiales);
          }}
        />

        <Retour
          ouvert={succes}
          message={<>Réglages enregistrés. Le portail patient les reprend à sa prochaine synchronisation.</>}
          gravite={"success"}
          onFermer={() => setSucces(false)}
        />
      </Box>
    </PageContainer>
  );
}
