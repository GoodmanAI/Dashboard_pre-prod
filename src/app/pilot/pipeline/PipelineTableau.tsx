"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Button, Menu, MenuItem } from "@mui/material";
import { appliquerEnCours, destinationsPermises, type MouvementPipeline } from "@/pilot/lib/pipeline";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CrmEtapeCommerciale } from "@prisma/client";
import type { CartePipeline } from "@/pilot/lib/prospection/chargerTableau";
import { DialogueDebutPoc } from "@/pilot/components/formulaires/Poc";
import { DialogueSortie } from "@/pilot/components/formulaires/DialogueSortie";
import { PastilleTemperature } from "@/pilot/components/PastilleTemperature";
import type { OptionConcurrent } from "@/pilot/lib/concurrents/options";
import { envoyer as envoyerFormulaire } from "@/pilot/components/formulaires/DialogueFormulaire";
import { changementEtape } from "@/pilot/lib/validation/organisation";
import { vieillissement } from "@/pilot/lib/pipeline";
import { debutDuJour } from "@/pilot/lib/dates";
import { euros } from "@/pilot/lib/argent";
import { CONTRAT_EN_BROUILLON_COURT } from "@/pilot/lib/montants/montantAffiche";
import { compter } from "@/pilot/lib/texte";
import {
  ETAPES_COMMERCIALES,
  ETAPES_LIVRAISON,
  ETAPES_SORTIE,
  LIBELLES,
  SEUIL_VIEILLISSEMENT,
  SOUS_TITRES,
  transitionPermise,
} from "@/pilot/lib/pipeline";
import { dateCourte } from "@/pilot/lib/integration/estimation";
import { LienAccent, Vide } from "@/pilot/components/Bloc";
import { NavFamilles } from "./NavFamilles";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";

export type { CartePipeline };

const COLONNES = [...ETAPES_COMMERCIALES, ...ETAPES_LIVRAISON, ...ETAPES_SORTIE];
// Une famille à la fois, au plus quatre colonnes par ligne ; le POC passe à la ligne suivante.
export const FAMILLES = {
  commercial: { nom: "Avant la signature", etapes: ETAPES_COMMERCIALES },
  sorties: { nom: "Perdus, en pause et POC non transformés", etapes: ETAPES_SORTIE },
} as const;
export type Famille = keyof typeof FAMILLES;

const JOUR_MS = 24 * 60 * 60 * 1000;
/** Cartes affichées dans la colonne Prospect ; les autres se trouvent dans la liste À prospecter. */
const PLAFOND_PROSPECTS = 12;

export function PipelineTableau({ cartes, famille, vue, montantsModifiables, concurrents }: {
  cartes: CartePipeline[]; famille: Famille; vue: "moi" | "equipe";
  /** Pour « Contre qui ? » quand un dossier sort en Perdu pour la raison « Concurrent » (lot R). */
  concurrents: OptionConcurrent[];
  /** Sans le droit de modifier les montants, un contrat en brouillon se dit court : ce compte n'a rien à y faire. */
  montantsModifiables: boolean;
}) {
  const router = useRouter();
  const mouvements = useRef(new Map<number, MouvementPipeline>());
  const [enCours, setEnCours] = useState(mouvements.current);
  const [confirmes, setConfirmes] = useState(new Map<number, MouvementPipeline>());
  const [menu, setMenu] = useState<{ ancre: HTMLElement; carte: CartePipeline } | null>(null);
  // Un mouvement confirmé tient tant que le serveur montre encore l'étape d'origine
  // (rafraîchissement en retard). Dès qu'il montre autre chose, le serveur fait foi.
  useEffect(() => setConfirmes((anciens) => new Map([...anciens].filter(([id, m]) => cartes.find((c) => c.id === id)?.etape === m.depuis))), [cartes]);
  const etat = useMemo(() => appliquerEnCours(appliquerEnCours(cartes, confirmes), enCours), [cartes, confirmes, enCours]);
  function mouvement(id: number, valeur?: MouvementPipeline) {
    const suivants = new Map(mouvements.current);
    if (valeur) suivants.set(id, valeur); else suivants.delete(id);
    mouvements.current = suivants; setEnCours(suivants);
  }
  const [message, setMessage] = useState<string | null>(null);
  const [information, setInformation] = useState<string | null>(null);
  const [poc, setPoc] = useState<number | null>(null);
  const [sortie, setSortie] = useState<{
    carteId: number;
    vers: CrmEtapeCommerciale;
    depuis: CrmEtapeCommerciale;
  } | null>(null);

  const parColonne = useMemo(() => {
    const map = new Map<string, CartePipeline[]>();
    for (const colonne of COLONNES) map.set(colonne, []);
    for (const carte of etat) {
      map.get(carte.etape)?.push(carte);
    }
    return map;
  }, [etat]);

  /** Depuis la boîte de sortie, l'erreur remonte au formulaire, qui reste ouvert avec la saisie. */
  async function enregistrer(carteId: number, vers: CrmEtapeCommerciale, valeurs = {}, depuisDialogue = false) {
    const courant = mouvements.current.get(carteId);
    if (!courant) return;
    try {
      await envoyerFormulaire(`/api/pilot/organisations/${carteId}/etape`, "PATCH", changementEtape, { etape: vers, ...valeurs });
    } catch (e) {
      if (depuisDialogue) throw e;
      mouvement(carteId);
      setMessage(e instanceof Error ? e.message : "Le changement d'étape a été refusé.");
      return;
    }
    setConfirmes((precedents) => new Map(precedents).set(carteId, courant));
    mouvement(carteId);
    setPoc(null);
    setSortie((s) => (s?.carteId === carteId ? null : s));
    // Le Déplacer peut changer de famille : la carte quitte l'écran, on dit où elle est.
    if (!FAMILLES[famille].etapes.includes(vers)) setInformation(`Dossier passé en ${LIBELLES[vers]}.`);
    router.refresh();
  }
  function deplacer(carte: CartePipeline, vers: CrmEtapeCommerciale) {
    if (mouvements.current.has(carte.id) || vers === carte.etape) return;
    if (!transitionPermise(carte.etape, vers)) {
      setMessage(`${LIBELLES[carte.etape]} vers ${LIBELLES[vers]} : refusé. Une étape avance ou recule d'un cran, ou sort en Perdu ou En sommeil.`);
      return;
    }
    if (carte.etape === "EN_POC" && vers === "SIGNE") { router.push(`/pilot/organisations/${carte.id}`); return; }
    const m = { vers, depuis: carte.etape };
    mouvement(carte.id, m);
    if (ETAPES_SORTIE.includes(vers)) setSortie({ carteId: carte.id, ...m });
    else if (vers === "EN_POC") setPoc(carte.id);
    else void enregistrer(carte.id, vers);
  }
  function onDragEnd(resultat: DropResult) {
    if (!resultat.destination) return;
    const carte = etat.find((c) => c.id === Number(resultat.draggableId));
    if (carte) deplacer(carte, resultat.destination.droppableId as CrmEtapeCommerciale);
  }
  function annulerSortie() {
    if (sortie) mouvement(sortie.carteId);
    setSortie(null);
  }

  return (
    <>
      <NavFamilles actif={famille} entrees={[
        { cle: "prospection", nom: "À prospecter", detail: "Liste filtrable : région, RIS, priorité, température", href: "/pilot/pipeline/prospection",
          compte: (parColonne.get("PROSPECT") ?? []).length },
        ...(Object.entries(FAMILLES) as [Famille, (typeof FAMILLES)[Famille]][]).map(([cle, { nom, etapes }]) => {
          const dossiers = etapes.flatMap((e) => parColonne.get(e) ?? []);
          const pondere = dossiers.reduce((t, c) => t + c.montantPondereCentimes, 0);
          return { cle, nom, href: `/pilot/pipeline?vue=${vue}&famille=${cle}`, compte: dossiers.length,
            detail: `${etapes.map((e) => LIBELLES[e]).join(", ")}${pondere > 0 ? ` · ${euros(pondere)} / mois probables` : ""}` };
        }),
      ]} />
      <DragDropContext onDragEnd={onDragEnd}>
        <Box component="section" aria-label={FAMILLES[famille].nom}
          sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" } }}>
          {FAMILLES[famille].etapes.map((colonne) => {
            const toute = parColonne.get(colonne) ?? [];
            // Des centaines de prospects froids noieraient la colonne : les plus récents ici, le reste dans la liste (C-65).
            const liste = colonne === "PROSPECT" ? toute.slice(0, PLAFOND_PROSPECTS) : toute;
            const caches = toute.length - liste.length;
            const pondere = liste.reduce((t, c) => t + c.montantPondereCentimes, 0);
            const seuil = SEUIL_VIEILLISSEMENT[colonne];
            return <Box key={colonne} sx={{ minWidth: 0, p: 1, borderRadius: "18px", bgcolor: JETONS.couloir }}>
              <Box sx={{ px: 1, pt: 0.75, pb: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontWeight={600}>{LIBELLES[colonne]}</Typography>
                  <Compteur valeur={toute.length} fond="background.paper" />
                </Stack>
                <Typography variant="caption" color="text.secondary" component="div">
                  {SOUS_TITRES[colonne]}{seuil ? ` · alerte après ${seuil} jours` : ""}
                </Typography>
                {pondere > 0 && <Typography variant="caption" color="text.secondary" component="div">{euros(pondere)} / mois probables</Typography>}
              </Box>
              <Droppable droppableId={colonne}>
                {(fourni, etatDrop) => (
                  <Box ref={fourni.innerRef} {...fourni.droppableProps}
                    sx={{ minHeight: 120, borderRadius: "14px", transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`, bgcolor: etatDrop.isDraggingOver ? JETONS.accentFond : "transparent" }}>
                    {!liste.length && !etatDrop.isDraggingOver && <Vide>Aucun dossier à cette étape. Glissez une carte ici, ou utilisez le menu Déplacer.</Vide>}
                    {liste.map((carte, index) => (
                      <Draggable draggableId={String(carte.id)} index={index} key={carte.id} isDragDisabled={enCours.has(carte.id)}>
                        {(fourniCarte, etatCarte) => (
                          <Box ref={fourniCarte.innerRef} {...fourniCarte.draggableProps} {...fourniCarte.dragHandleProps} sx={{ pb: 1.25 }}>
                            <Card sx={{ borderRadius: "14px", cursor: "grab", opacity: enCours.has(carte.id) ? 0.55 : 1,
                              transition: `box-shadow ${MOUVEMENT.normal} ${MOUVEMENT.courbe}, transform ${MOUVEMENT.normal} ${MOUVEMENT.courbe}`,
                              "&:hover": { boxShadow: JETONS.ombreSurvol, transform: "translateY(-1px)" },
                              ...(etatCarte.isDragging ? { boxShadow: JETONS.ombreFlottante, transform: "scale(1.02)" } : {}) }}>
                              <Stack spacing={1} sx={{ px: 1.75, py: 1.5 }}>
                                <Box>
                                  <Typography component={Link} href={`/pilot/organisations/${carte.id}`} fontWeight={600} sx={{ display: "block", lineHeight: 1.3, overflowWrap: "anywhere" }}>{carte.nom}</Typography>
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                                    {[carte.sites !== null ? compter(carte.sites, "site") : null, carte.responsable].filter(Boolean).join(" · ")}
                                  </Typography>
                                </Box>
                                {carte.temperature && <Box><PastilleTemperature valeur={carte.temperature} /></Box>}
                                {carte.produits.length > 0 && <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
                                  {carte.produits.map((p) => <Chip key={p} label={p} />)}
                                </Stack>}
                                {carte.montant && (carte.montant.centimes === null
                                  ? <Typography variant="body2" color="text.secondary">{montantsModifiables ? carte.montant.libelle : CONTRAT_EN_BROUILLON_COURT}</Typography>
                                  : <Typography variant="body2" fontWeight={500}>
                                    {euros(carte.montant.centimes)} / mois <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>· {carte.montant.libelle}</Box>
                                  </Typography>)}
                                <Stack spacing={0.375} sx={{ borderTop: `1px solid ${JETONS.filetInterne}`, pt: 1 }}>
                                  {enCours.has(carte.id) ? <Typography variant="caption" color="text.secondary" role="status">Enregistrement…</Typography> : <>
                                    <Signaux carte={carte} />
                                    <Silence date={carte.dernierEchangeLe} />
                                  </>}
                                </Stack>
                                <Box sx={{ textAlign: "right" }}>
                                  <Button size="small" variant="outlined" aria-haspopup="menu" aria-controls={menu?.carte.id === carte.id ? "deplacer-carte" : undefined}
                                    aria-expanded={menu?.carte.id === carte.id ? true : undefined} disabled={enCours.has(carte.id)}
                                    onClick={(e) => setMenu({ ancre: e.currentTarget, carte })}>Déplacer</Button>
                                </Box>
                              </Stack>
                            </Card>
                          </Box>
                        )}
                      </Draggable>
                    ))}
                    {fourni.placeholder}
                    {caches > 0 && <Box sx={{ px: 1, pb: 0.5 }}>
                      <LienAccent href="/pilot/pipeline/prospection">{compter(caches, "autre prospect", "autres prospects")} dans À prospecter</LienAccent>
                    </Box>}
                  </Box>
                )}
              </Droppable>
            </Box>;
          })}
        </Box>
      </DragDropContext>

      <Menu id="deplacer-carte" anchorEl={menu?.ancre} open={!!menu} onClose={() => setMenu(null)}>
        {menu && destinationsPermises(menu.carte.etape).map((vers) => <MenuItem key={vers} onClick={() => {
          const carte = menu.carte; setMenu(null); deplacer(carte, vers);
        }}>{LIBELLES[vers]}</MenuItem>)}
      </Menu>
      {poc !== null && <DialogueDebutPoc fermer={() => { mouvement(poc); setPoc(null); }} enregistrer={(pocDebuteLe) => enregistrer(poc, "EN_POC", { pocDebuteLe }, true)} />}
      {sortie && <DialogueSortie vers={sortie.vers as "PERDU" | "EN_SOMMEIL" | "POC_NON_TRANSFORME"} fermer={annulerSortie} concurrents={concurrents}
        enregistrer={(valeurs) => enregistrer(sortie.carteId, sortie.vers, valeurs, true)} />}

      <Snackbar
        open={message !== null}
        autoHideDuration={6000}
        onClose={() => setMessage(null)}
      >
        <Alert icon={false} severity="warning" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      </Snackbar>
      <Snackbar open={information !== null} autoHideDuration={4000} onClose={() => setInformation(null)} message={information} />
    </>
  );
}

function Compteur({ valeur, fond }: { valeur: number; fond: string }) {
  return <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", bgcolor: fond, borderRadius: 999, px: "7px", py: "1px" }}>{valeur}</Box>;
}

function Silence({ date }: { date: string | null }) {
  if (!date) return null;
  const jours = Math.floor((Date.now() - new Date(date).getTime()) / JOUR_MS);
  if (jours < 30) return null;
  return <Typography variant="caption" color="error" fontWeight={500} display="block">Sans contact depuis {jours} jours</Typography>;
}

function Signaux({ carte }: { carte: CartePipeline }) {
  const age = vieillissement(carte.etape as CrmEtapeCommerciale, new Date(carte.etapeDepuisLe), new Date());
  const commerciale = ETAPES_COMMERCIALES.includes(carte.etape as CrmEtapeCommerciale);
  const enRetard = carte.prochaineActionLe && new Date(carte.prochaineActionLe) < debutDuJour(new Date());
  const sansAction = commerciale && !carte.prochaineActionLe;
  const couleur = enRetard ? "error.main" : sansAction ? "warning.main" : "text.secondary";
  return <>
    <Typography variant="caption" display="block" color={age.depasse ? "warning.main" : "text.secondary"} fontWeight={age.depasse ? 500 : 400}>{age.jours} j dans l&apos;étape</Typography>
    <Typography variant="caption" display="block" color={couleur} fontWeight={couleur === "text.secondary" ? 400 : 500}>
      Prochaine action : {carte.prochaineAction ?? "aucune"}
      {carte.prochaineActionLe ? ` · ${dateCourte(carte.prochaineActionLe)}` : carte.prochaineAction ? " · date à préciser" : ""}
    </Typography>
  </>;
}
