"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Moi, Personne } from "@/pilot/components/formulaires/Demandes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, ButtonBase, Card, Chip, Collapse, Stack, Typography } from "@mui/material";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import type { CaseIntegration, DonneesIntegrations, FiltresIntegration, LigneIntegration } from "@/pilot/lib/checklist/chargerIntegrations";
import type { ComptesEvaluation } from "@/pilot/lib/checklist/evaluer";
import { libelleAttente } from "@/pilot/lib/checklist/reglesAttentes";
import { dateCourte, libelleCritique, libelleDateRealiste, libelleEcart, type Estimation } from "@/pilot/lib/integration/estimation";
import { FiltresAttentes } from "@/pilot/components/formulaires/FiltresAttentes";
import { envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { ActionsAttente } from "@/pilot/components/formulaires/ActionsAttente";
import { EnTete } from "@/pilot/components/Bloc";
import { compter } from "@/pilot/lib/texte";
import { LIBELLES_PHASES, PHASES } from "@/pilot/lib/checklist/definition";
import { JETONS } from "@/pilot/jetons";
import { VoletEtape } from "./VoletEtape";

const date = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const jours = (v: string) => Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86400000));
export function TableauIntegrations({ donnees: d, filtres, comptes, moi }: { donnees: DonneesIntegrations; filtres: FiltresIntegration; comptes: Personne[]; moi: Moi }) {
  const router = useRouter();
  const [selection, setSelection] = useState<{ ligne: LigneIntegration; etape: CaseIntegration } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Repliées par défaut : une ligne par centre, le détail au clic. Une seule ligne, ou une ligne
  // visée par l'adresse (lien « Voir la ligne », check-list d'un centre), s'ouvre d'elle-même.
  const [ouvertes, setOuvertes] = useState<Set<number>>(() => {
    const visee = Number(filtres.centreProduitId);
    if (d.lignes.length === 1) return new Set([d.lignes[0].centreProduitId]);
    return new Set(d.lignes.some((l) => l.centreProduitId === visee) ? [visee] : []);
  });
  const basculer = (id: number) => setOuvertes((avant) => {
    const apres = new Set(avant);
    if (!apres.delete(id)) apres.add(id);
    return apres;
  });
  useEffect(() => {
    const ouvrirAncre = () => {
      const id = Number(/^#integration-(\d+)$/.exec(window.location.hash)?.[1]);
      if (id) setOuvertes((avant) => new Set(avant).add(id));
    };
    ouvrirAncre();
    window.addEventListener("hashchange", ouvrirAncre);
    return () => window.removeEventListener("hashchange", ouvrirAncre);
  }, []);
  const lienPage = (page: number) => {
    const params = new URLSearchParams(Object.entries(filtres).filter((e): e is [string, string] => e[1] !== undefined));
    params.set("page", String(page)); return `/pilot/integrations?${params}`;
  };
  async function evaluer() {
    setEnvoi(true); setErreur(null); setMessage(null);
    try {
      const c = await envoyer<ComptesEvaluation>("/api/pilot/evaluation", "POST");
      setMessage(`${c.rattachements} lignes évaluées. ${c.creations} cases créées, ${c.cochees} cochées, ${c.regressions} régressions, ${c.inchangees} inchangées.`);
      router.refresh();
    } catch (e) { setErreur(e instanceof Error ? e.message : "L'évaluation a échoué."); }
    finally { setEnvoi(false); }
  }
  const regressees = new Set(d.regressions.map((r) => r.etapeId));
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <EnTete titre="Déploiement" sousTitre="Préparez les dossiers à venir, puis suivez les installations en cours. Les prospects en POC sont inclus.">
      {/* Le serveur et le navigateur ne lisent pas l'horloge à la même minute. */}
      <Typography variant="body2" color="text.secondary" suppressHydrationWarning>{libelleEvaluation(d.derniereEvaluation)}</Typography>
      {d.peutEvaluer && <Button variant="outlined" onClick={() => void evaluer()} disabled={envoi}>Vérifier maintenant</Button>}
    </EnTete>
    {message && <Alert severity="success" role="status">{message}</Alert>}{erreur && <Alert severity="error">{erreur}</Alert>}
    <FiltresAttentes filtres={filtres} chefs={d.chefs} produits={d.produits} vagues={d.vagues} />
    {d.regressions.length > 0 && <Box role="status" sx={{ border: `1px solid ${JETONS.regressionFilet}`, bgcolor: JETONS.regressionFond, borderRadius: "12px", px: 2, py: 1.5 }}>
      <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>Étapes revenues en arrière</Typography>
      {d.regressions.map((r) => <Stack key={r.etapeId} direction="row" flexWrap="wrap" useFlexGap columnGap={2} rowGap={0.5} alignItems="center" sx={{ py: 0.25 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: "1 1 240px", minWidth: 0 }}>{r.libelle} : était faite{r.faiteLe ? ` le ${date(r.faiteLe)}` : ""}, ne l&apos;est plus · {r.centre} · {r.produit}</Typography>
        <Button variant="outlined" onClick={() => setOuvertes((avant) => new Set(avant).add(r.centreProduitId))} component={Link} href={d.lignes.some((l) => l.centreProduitId === r.centreProduitId) ? `#integration-${r.centreProduitId}` : `/pilot/integrations?organisationId=${r.organisationId}&centreProduitId=${r.centreProduitId}#integration-${r.centreProduitId}`}>Voir la ligne</Button>
      </Stack>)}
      {d.regressions.length === 50 && <Typography variant="caption">Les 50 premières cases concernées sont affichées. Précisez les filtres pour réduire la liste.</Typography>}
    </Box>}
    {d.lignes.length > 1 && <Stack direction="row" spacing={1} justifyContent="flex-end">
      <Button size="small" onClick={() => setOuvertes(new Set(d.lignes.map((l) => l.centreProduitId)))}>Tout déplier</Button>
      <Button size="small" onClick={() => setOuvertes(new Set())}>Tout replier</Button>
    </Stack>}
    {([false, true] as const).map((enCours) => <Stack key={String(enCours)} component="section" spacing={1.5} sx={{ minWidth: 0 }} aria-label={enCours ? "En cours" : "À venir"}>
    <Typography variant="h2">{enCours ? "En cours" : "À venir"}</Typography>
    {!d.lignes.some((l) => l.enCours === enCours) && (enCours || !d.aPreparer.length) && <Typography color="text.secondary">{enCours ? "Aucun déploiement démarré pour ces filtres. Les dossiers se préparent dans À venir." : "Aucun déploiement à préparer pour ces filtres. Ajoutez un centre et son produit depuis la fiche."}</Typography>}
    {!enCours && d.aPreparer.map((o) => <Card key={o.organisationId} sx={{ p: 2, minWidth: 0 }}>
      <Typography component={Link} href={`/pilot/organisations/${o.organisationId}`} fontWeight={600} sx={{ overflowWrap: "anywhere" }}>{o.nom}{o.etape === "EN_POC" ? " · En POC" : ""}</Typography>
      <Typography variant="body2" color="text.secondary">Aucun centre ne suit encore de produit. Ajoutez un centre et son produit sur la fiche pour préparer les prérequis.</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1, mt: 1 }}>
        {o.prerequis.map((p) => <Box key={p.libelle} sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600}>{p.libelle} : {p.applicable ? p.faite ? "prêt" : "à compléter" : "sans objet"}</Typography>
          <Typography variant="caption" color="text.secondary">{p.detail}</Typography>
        </Box>)}
      </Box>
      <Button component={Link} href={`/pilot/organisations/${o.organisationId}?onglet=centres`}>Préparer les centres</Button>
    </Card>)}
    {d.lignes.filter((l) => l.enCours === enCours).map((ligne) => {
      const faites = ligne.cases.filter((c) => c.faite).length;
      const bloquantes = ligne.cases.filter((c) => !c.faite && c.bloquante).length;
      const delai = ligne.datePromise ? Math.ceil((new Date(ligne.datePromise).getTime() - Date.now()) / 86400000) : null;
      const ouverte = ouvertes.has(ligne.centreProduitId);
      const termine = ligne.estimation.enProduction && ligne.estimation.pret;
      const resume = termine
        ? (ligne.estimation.miseEnProductionLe ? `En service depuis le ${dateCourte(ligne.estimation.miseEnProductionLe)}` : "En production")
        : [libelleDateRealiste(ligne.estimation), ligne.estimation.etapeCritique ? libelleCritique(ligne.estimation.etapeCritique) : null].filter(Boolean).join(" · ");
      const idDetail = `detail-${ligne.centreProduitId}`;
      return <Card key={ligne.centreProduitId} id={`integration-${ligne.centreProduitId}`} sx={{ scrollMarginTop: 80 }}>
        <ButtonBase onClick={() => basculer(ligne.centreProduitId)} aria-expanded={ouverte} aria-controls={idDetail}
          sx={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1.5, rowGap: 0.75, px: 2, py: 1.25, textAlign: "left", justifyContent: "flex-start",
            transition: "background-color 160ms", "&:hover": { bgcolor: JETONS.surface } }}>
          <Box sx={{ flex: "1 1 300px", minWidth: 0, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box component="span" aria-hidden sx={{ display: "flex", flexShrink: 0, color: "text.secondary", transition: "transform 200ms cubic-bezier(0.25, 0.1, 0.25, 1)", transform: ouverte ? "rotate(90deg)" : "none" }}>
              <IconChevronRight size={18} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={600} noWrap>{ligne.organisationNom}{ligne.etape === "EN_POC" ? " · En POC" : ""}<Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}> · {ligne.centreNom}</Box></Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block" suppressHydrationWarning>{resume}</Typography>
            </Box>
          </Box>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} alignItems="center" sx={{ flex: "0 1 auto", minWidth: 0, ml: "auto", pl: { xs: 4.25, sm: 0 } }}>
            <Chip size="small" label={ligne.produit} />
            <Stack direction="row" alignItems="center" gap={0.75} aria-label={`${faites} étapes faites sur ${ligne.cases.length}`}>
              <Box aria-hidden sx={{ width: 56, height: 5, bgcolor: JETONS.rail, borderRadius: "3px", overflow: "hidden" }}>
                <Box sx={{ height: "100%", width: `${ligne.cases.length ? Math.floor((100 * faites) / ligne.cases.length) : 0}%`, bgcolor: faites === ligne.cases.length ? "success.main" : "primary.main" }} />
              </Box>
              <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>{faites}/{ligne.cases.length}</Typography>
            </Stack>
            {bloquantes > 0 && <Chip size="small" color="error" label={compter(bloquantes, "bloquante")} />}
            {delai !== null && <Chip size="small" color={delai < 0 ? "error" : delai <= 14 ? "warning" : "success"} suppressHydrationWarning label={delai < 0 ? `Promise dépassée de ${-delai} j` : `Promise le ${date(ligne.datePromise!)}`} />}
            {!ligne.provisionne && <Chip size="small" color="warning" label="Sans compte Dashboard" />}
          </Stack>
        </ButtonBase>
        {!enCours && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1, p: 2 }}>
          {ligne.prerequis.map((p) => <Box key={p.libelle} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <Typography variant="body2" fontWeight={600}>{p.libelle} : {p.applicable ? p.faite ? "prêt" : "à compléter" : "sans objet"}</Typography>
            <Typography variant="caption" color="text.secondary">{p.detail}</Typography>
            {p.applicable && !p.faite && <Button size="small" onClick={() => {
              const e = ligne.cases.find((c) => c.cle === p.cle);
              if (e) setSelection({ ligne, etape: e }); else router.push("/pilot/organisations/" + ligne.organisationId + (p.id === "commercial-edl" ? "?onglet=contacts" : "?onglet=centres"));
            }}>Compléter</Button>}
          </Box>)}
        </Box>}
        <Collapse in={ouverte} unmountOnExit id={idDetail}>
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ px: 2.5, pt: 1.5 }}>
          <Button size="small" variant="outlined" component={Link} href={`/pilot/organisations/${ligne.organisationId}?onglet=centres`}>Ouvrir la fiche</Button>
          {delai !== null && <Typography variant="body2" color="text.secondary" suppressHydrationWarning>{delai < 0 ? `Date promise dépassée de ${-delai} j` : `Promise le ${date(ligne.datePromise!)}, dans ${delai} j`}</Typography>}
          {!ligne.provisionne && <Typography variant="body2" color="warning.main">Pas encore de compte sur le Dashboard</Typography>}
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 300px" }, gap: 2.5, px: 2.5, pt: 2, pb: 2.5 }}>
          {/* Les six phases de la checklist de déploiement, dans l'ordre (C-85). */}
          <Stack spacing={2} sx={{ minWidth: 0 }}>
            {PHASES.map((phase) => {
              const cases = ligne.cases.filter((e) => e.phase === phase);
              if (!cases.length) return null;
              const faitesPhase = cases.filter((e) => e.faite).length;
              return <Box key={phase} component="section" aria-label={LIBELLES_PHASES[phase]} sx={{ minWidth: 0 }}>
                <Typography variant="caption" component="h3" color="text.secondary" fontWeight={600} sx={{ m: 0, mb: 0.75 }}>
                  {LIBELLES_PHASES[phase]} · {faitesPhase}/{cases.length}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1, alignContent: "start" }}>
                  {cases.map((e) => <CaseEtape key={e.cle} etape={e} regression={e.id !== null && regressees.has(e.id)} ouvrir={() => setSelection({ ligne, etape: e })} />)}
                </Box>
              </Box>;
            })}
          </Stack>
          <Stack spacing={1.75} sx={{ minWidth: 0 }}>
            <DateRealiste estimation={ligne.estimation} />
            <Encart titre="En attente de">
              {ligne.cases.filter((e) => e.enAttenteDe).map((e) => <Box key={e.cle} sx={{ "& + &": { borderTop: `1px solid ${JETONS.filetInterne}`, mt: 1.25, pt: 1.25 } }}>
                <Typography variant="body2" fontWeight={500} suppressHydrationWarning>{libelleAttente(e.enAttenteDe!)}{e.demandeeLe ? ` depuis ${jours(e.demandeeLe)} j` : ""}</Typography>
                <Typography variant="caption" color="text.secondary" display="block">{e.libelle}</Typography>
                <Typography variant="caption" color="text.secondary" display="block">{e.derniereRelanceLe ? `relancé le ${date(e.derniereRelanceLe)}` : "jamais relancé"}</Typography>
                {e.echeanceLe && <Typography variant="caption" color="text.secondary" display="block">Échéance : {date(e.echeanceLe)}</Typography>}
                {e.id !== null && <Box sx={{ mt: 0.5, ml: -1.25 }}><ActionsAttente id={e.id} taille="small" /></Box>}
              </Box>)}
              {!ligne.cases.some((e) => e.enAttenteDe) && <Typography variant="body2" color="text.secondary">Aucune attente déclarée.</Typography>}
            </Encart>
          </Stack>
        </Box>
        </Collapse>
      </Card>;
    })}
    </Stack>)}
    {(d.suite || d.page > 1) && <Stack direction="row" spacing={2} alignItems="center"><Typography variant="caption">Page {d.page}. 50 lignes au plus.</Typography>
      {d.page > 1 && <Button component={Link} href={lienPage(d.page - 1)}>Page précédente</Button>}
      {d.suite && <Button component={Link} href={lienPage(d.page + 1)}>Page suivante</Button>}
    </Stack>}
    {selection && <VoletEtape {...selection} comptes={comptes} moi={moi} fermer={() => setSelection(null)} />}
  </Stack>;
}

const MODES = { MANUEL: "À cocher", AUTOMATIQUE: "Automatique", MIXTE: "En partie automatique" };

/** Une case d'étape. Une étape automatique n'a rien à cocher : la case ouvre le détail, en lecture seule. */
function CaseEtape({ etape: e, regression, ouvrir }: { etape: CaseIntegration; regression: boolean; ouvrir: () => void }) {
  const bloquee = !e.faite && (e.bloquante || regression);
  const automatique = e.mode === "AUTOMATIQUE";
  const etat = e.faite ? (e.faiteLe ? `${automatique ? "constatée" : "faite"} le ${date(e.faiteLe)}` : "faite")
    : e.attendMiseEnService ? "après la mise en service"
    : e.prevueLe ? `prévue le ${date(e.prevueLe)}`
    : e.enAttenteDe ? `en attente, ${libelleAttente(e.enAttenteDe).toLowerCase()}`
    : e.motif ? (automatique ? `vide : ${e.motif}` : e.motif) : "à faire";
  return <ButtonBase aria-label={`${e.libelle} · ${e.faite ? "faite" : "à faire"} · ${automatique ? "automatique, lecture seule" : "ouvrir"}`} onClick={ouvrir}
    sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", justifyContent: "flex-start", textAlign: "left", p: "12px 14px", minHeight: 60, borderRadius: "14px", bgcolor: bloquee ? JETONS.regressionFond : JETONS.surface,
      border: `1px solid ${bloquee ? JETONS.regressionFilet : "transparent"}`, transition: "background-color 160ms, box-shadow 160ms",
      "&:hover": { bgcolor: "background.paper", boxShadow: JETONS.ombreSurvol } }}>
    <Box sx={{ width: 22, height: 22, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
      border: e.faite ? "none" : bloquee ? "2px solid" : `2px solid ${JETONS.cercle}`, borderColor: bloquee ? "error.main" : undefined, bgcolor: e.faite ? "primary.main" : "transparent", color: "common.white" }}>
      {e.faite && <IconCheck size={13} stroke={3} />}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={500} color={e.faite ? "text.secondary" : "text.primary"} sx={{ lineHeight: 1.3 }}>{e.libelle}</Typography>
      <Typography variant="caption" color={regression && !e.faite ? "error.main" : "text.secondary"} display="block" sx={{ mt: 0.25 }}>
        {MODES[e.mode]}{e.bloquante && !e.faite ? " · bloquante" : ""} · {etat}
      </Typography>
    </Box>
  </ButtonBase>;
}

function Encart({ titre, children }: { titre: string; children: ReactNode }) {
  return <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", px: 2, py: 1.75 }}>
    <Typography variant="caption" component="h3" color="text.secondary" fontWeight={600} sx={{ m: 0, mb: 0.75 }}>{titre}</Typography>
    {children}
  </Box>;
}

/** La colonne date réaliste : la date, l'écart avec la promesse, ce qui pèse le plus. */
function DateRealiste({ estimation: e }: { estimation: Estimation }) {
  const termine = e.enProduction && e.pret;
  return <Encart titre="Date estimée">
    {termine
      ? <Typography variant="body2">{e.miseEnProductionLe ? `En service depuis le ${dateCourte(e.miseEnProductionLe)}` : "En production"}</Typography>
      : <>
        <Typography variant="h5" component="p">{libelleDateRealiste(e)}</Typography>
        <Typography variant="caption" color={e.ecartJours !== null && e.ecartJours > 0 ? "warning.main" : "text.secondary"} fontWeight={e.ecartJours !== null && e.ecartJours > 0 ? 500 : 400} display="block" sx={{ mt: 0.25 }}>{libelleEcart(e.ecartJours)}</Typography>
        {e.etapeCritique && <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.75 }}>{libelleCritique(e.etapeCritique)}</Typography>}
      </>}
    {e.reserves && <Typography variant="caption" display="block" color="warning.main">En service, étapes à finir</Typography>}
    {e.suiviRenforceJusquAu && <Typography variant="caption" display="block">En suivi renforcé jusqu&apos;au {dateCourte(e.suiviRenforceJusquAu)}</Typography>}
  </Encart>;
}

/** « à l'instant », « il y a 4 min », « il y a 2 h » : jamais « il y a 0 min ». */
function libelleEvaluation(le: string | null): string {
  if (!le) return "Jamais vérifié";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(le).getTime()) / 60000));
  if (minutes < 1) return "Vérifié à l'instant";
  if (minutes < 60) return `Vérifié il y a ${minutes} min`;
  return `Vérifié il y a ${Math.floor(minutes / 60)} h`;
}
