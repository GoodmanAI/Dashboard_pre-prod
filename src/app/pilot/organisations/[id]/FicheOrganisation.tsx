"use client";
import { IconBell, IconId, IconListCheck, IconMessageCircle, IconNotes, IconSend } from "@tabler/icons-react";
import { BoutonDemander, LigneDemande, type Moi } from "@/pilot/components/formulaires/Demandes";
import { BlocCommentaires, type PageFil } from "@/pilot/components/formulaires/Commentaires";
import type { Cibles } from "@/pilot/lib/commentaires/cibles";
import type { LigneDemande as Demande } from "@/pilot/lib/demandes/charger";
import type { LigneSujet } from "@/pilot/lib/support/charger";
import { BlocSupport } from "@/pilot/components/formulaires/Support";
import { BLOCAGES_TECHNIQUES, ORIGINES, resumeEquipements, type CleBlocage, type CleOrigine } from "@/pilot/lib/organisations/referentielClient";
import { OpportunitesOrganisation, type OpportuniteFiche } from "./OpportunitesOrganisation";
import { PRIORITES } from "@/pilot/lib/prospection/regles";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Button, Card, CardContent, Chip, Snackbar, Stack, Tab, Tabs, Typography } from "@mui/material";
import type { CrmIssueCyclePoc, CrmEtapeCommerciale, CrmTypeEchange, CrmRaisonSortie } from "@prisma/client";
import { nombreDeSites } from "@/pilot/lib/organisations/sites";
import { estClient, LIBELLES, SOUS_TITRES, LIBELLES_RAISONS, LIBELLES_ATTITUDE, RUBRIQUES, rubriqueDe, vieillissement } from "@/pilot/lib/pipeline";
import { useRubrique } from "@/pilot/components/rubrique";
import type { Qualification } from "@/pilot/lib/organisations/qualification";
import { resumeTemperature, type TemperatureFiche } from "@/pilot/lib/organisations/temperatureAffichage";
import type { OptionConcurrent } from "@/pilot/lib/concurrents/options";
import { PastilleTemperature } from "@/pilot/components/PastilleTemperature";
import { TemperatureOrganisation } from "./TemperatureOrganisation";
import { DecisionAttendue, QualificationOrganisation, SolutionActuelle } from "@/pilot/components/formulaires/QualificationOrganisation";
import { Bloc, Ligne } from "@/pilot/components/Bloc";
import { compter } from "@/pilot/lib/texte";
import { ActionsSuivi } from "@/pilot/components/formulaires/ActionsSuivi";
import { SuiviPoc } from "@/pilot/components/formulaires/Poc";
import { ChangerEtape } from "@/pilot/components/formulaires/ChangerEtape";
import { debutDuJour } from "@/pilot/lib/dates";
import { CalendrierFacturation } from "@/pilot/components/CalendrierFacturation";
import type { FacturationVue } from "@/pilot/lib/facturation/charger";
import { eurosPrecis } from "@/pilot/lib/argent";
import { CONTRAT_A_SAISIR, CONTRAT_A_SAISIR_SANS_DROIT, CONTRAT_EN_BROUILLON_SANS_DROIT, estimeSansContrat, montantDuDossier } from "@/pilot/lib/montants/montantAffiche";
import { LIBELLES_ECHANGE } from "@/pilot/lib/echanges/libelles";
import type { PageChronologie } from "@/pilot/lib/evenements/lire";
import type { Complement } from "@/pilot/lib/organisations/aCompleter";
import type { CompteProduit } from "@/pilot/lib/referentiels";
import type { SuggestionsSaisie } from "@/pilot/lib/organisations/suggestions";
import { TYPES_ORGANISATION, type IdentiteOrganisation, type IdentiteLegale, type CompteInterne, type CompteClient } from "@/pilot/components/formulaires/ChampsOrganisation";
import { ROLES_CONTACT, type ContactEditable } from "@/pilot/components/formulaires/ChampsContact";
import { DialoguesFiche, type CentreFiche, type Dialogue, type VagueFiche } from "./DialoguesFiche";
import { CentresOrganisation } from "./CentresOrganisation";
import { JournalEchanges } from "./JournalEchanges";
import type { Alerte } from "@/pilot/lib/alertes/types";
import { NegociationOrganisation, type PropositionFiche } from "./NegociationOrganisation";
import { ConvertirClient } from "./ConvertirClient";
import { ContratsOrganisation, type ContratFiche } from "./ContratsOrganisation";
import { DialogueAbonnement } from "./DialogueAbonnement";
import type { JalonFiche } from "./PlanSignature";
import { LigneAlerte } from "@/pilot/components/LigneAlerte";
import { BoutonSupprimerFiche } from "./BoutonSupprimerFiche";
import { libelleActivite } from "@/pilot/lib/annuaire/regles";

type OrganisationFiche = IdentiteOrganisation & IdentiteLegale & Qualification & {
  /** Le jour où l'identité a été lue dans l'annuaire (C-89). */
  annuaireLuLe: string | null;
  pocCycleOuvert: boolean; pocPrecedent: { debuteLe: string; prolongeLe: string | null; issue: CrmIssueCyclePoc } | null;
  pocDebuteLe: string | null; pocProlongeLe: string | null;
  etapeDepuisLe: string; prochaineAction: string | null; prochaineActionLe: string | null;
  raisonSortieCode: CrmRaisonSortie | null; reveilLe: string | null;
  /** L'étape d'où le dossier est sorti, pour l'y remettre d'un geste (C-86). */
  avantSortie: CrmEtapeCommerciale | null;
  solutionActuelle: string | null; decisionAttendueLe: string | null;
  /** Le concurrent en place, et celui qui a gagné une affaire perdue (lot R). */
  concurrentId: number | null; concurrentGagnantId: number | null;
  id: number; etape: CrmEtapeCommerciale; raisonSortie: string | null; commercial: string | null; chefDeProjet: string | null;
  /** Nom de l'apporteur quand le client a été apporté (C-63). */
  apporteur: string | null;
  /** Le contexte commercial écrit à l'import (§9.6). */
  notes: string | null;
  joursDansEtape: number; emailDashboard: string | null; contacts: ContactEditable[]; centres: CentreFiche[]; vagues: VagueFiche[];
  dernierEchange: { type: CrmTypeEchange; surveneuLe: string; compteRendu: string | null } | null;
};
const ONGLETS = { resume: "Résumé", contacts: "Contacts", negociation: "Négociation", centres: "Centres", argent: "Argent", chronologie: "Chronologie" };
type Onglet = keyof typeof ONGLETS;
const date = (valeur: string) => new Date(valeur).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function FicheOrganisation({ sujetsSupport, facturation, peutConfier = false, commentaires, cibles, temperature, concurrents, peutModifier, org, propositions, jalons, contrats, opportunites, alertes, demandes, moi, complements, historique, comptes, clients, suggestions, catalogue, comptesProduits, recurrent, pondere, montantsModifiables, compteClientConnu, grilleDu }: {
  /** Le fil des commentaires (première page) et ceux qu'on peut prévenir (lot T). */
  commentaires: PageFil; cibles: Cibles;
  /** Le barème de température, calculé par la page serveur (lot R). */
  temperature: TemperatureFiche; concurrents: OptionConcurrent[]; peutModifier: boolean;
  propositions: PropositionFiche[]; jalons: JalonFiche[]; contrats: ContratFiche[]; opportunites: OpportuniteFiche[];
  sujetsSupport: LigneSujet[];
  peutConfier?: boolean; org: OrganisationFiche; alertes: Alerte[]; demandes: Demande[]; moi: Moi; complements: Complement[]; historique: PageChronologie;
  comptes: CompteInterne[]; clients: CompteClient[]; suggestions: SuggestionsSaisie; catalogue: { id: number; name: string }[]; comptesProduits: CompteProduit[];
  recurrent: number; pondere: number; montantsModifiables: boolean; compteClientConnu: boolean;
  /** Le jour d'application de la grille tarifaire en vigueur, null s'il n'y en a aucune (lot S). */
  grilleDu: string | null; facturation: FacturationVue | null;
}) {
  const router = useRouter();
  const recherche = useSearchParams()!;
  const valeur = recherche.get("onglet");
  const onglet: Onglet = valeur && Object.hasOwn(ONGLETS, valeur) ? valeur as Onglet : "resume";
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [abonnement, setAbonnement] = useState(false);
  // « Convertir en client » avec une proposition en cours : l'onglet Négociation ouvre son acceptation.
  const [acceptation, setAcceptation] = useState<number | null>(null);
  // Un prospect se range sous Prospects, un client sous Clients : le fil d'Ariane et le menu le disent (C-87).
  const rubrique = RUBRIQUES[rubriqueDe(org.etape)];
  useRubrique(rubrique.href);
  const age = vieillissement(org.etape, new Date(org.etapeDepuisLe), new Date());
  const pastille = resumeTemperature(temperature);
  const gagnant = concurrents.find((c) => c.id === org.concurrentGagnantId);
  function ouvrirOnglet(cible: Onglet) {
    const parametres = new URLSearchParams(recherche.toString());
    parametres.set("onglet", cible);
    router.replace(`/pilot/organisations/${org.id}?${parametres}`, { scroll: false });
  }
  function completer(c: Complement) {
    if (c.action === "action") {
      router.replace(`/pilot/organisations/${org.id}?onglet=chronologie&saisir=1`, { scroll: false });
      return;
    }
    ouvrirOnglet(c.onglet);
    if (c.action === "contact") setDialogue({ type: "contact", principal: true });
    else if (c.action === "organisation" || c.action === "centre") setDialogue({ type: c.action });
    else if (c.action === "rattachement") {
      const centre = org.centres.find((centre) => centre.id === c.cibleId);
      setDialogue(centre ? { type: "rattachement", centre } : { type: "centre" });
    } else {
      const rattachement = org.centres.flatMap((centre) => centre.rattachements).find((r) => r.id === c.cibleId);
      if (rattachement) setDialogue({ type: "date", rattachement });
    }
  }
  const enRetard = org.prochaineActionLe && new Date(org.prochaineActionLe) < debutDuJour(new Date());
  // Le montant de l'en-tête : la même règle que la carte du tableau Prospects (C-70) ; un client sans contrat actif montre son estimé (C-92).
  const dossier = { client: estClient(org.etape), contrats, propositions, opportunites };
  const montant = montantDuDossier(dossier);
  const estime = estimeSansContrat(dossier);
  // Un client sans contrat actif saisit son abonnement d'ici, en une fois (retour de Maxime, 25/11/2026).
  const abonnementASaisir = montantsModifiables && dossier.client && !contrats.some((c) => c.statut === "ACTIF");
  const boutonMontant = abonnementASaisir
    ? <Button size="small" onClick={() => setAbonnement(true)}>Saisir l&apos;abonnement</Button>
    : <Button size="small" onClick={() => ouvrirOnglet("argent")}>Ajouter</Button>;
  // Une seule règle pour le nombre de sites (C-92) : le saisi, jamais sous le nombre de centres créés.
  const sites = nombreDeSites(org.nombreSites, org.centres.length);
  const taille = [sites !== null ? compter(sites, "site") : null, org.nombreSalles !== null ? compter(org.nombreSalles, "salle") : null].filter(Boolean).join(", ");
  return <Stack spacing={2.5}>
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={0.75} sx={{ fontSize: 13, color: "text.secondary" }}><Link href={rubrique.href}>{rubrique.libelle}</Link><span>/</span><span>{org.raisonSocialeNom}</span></Stack>
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} alignItems="flex-start">
        <Box sx={{ flex: "1 1 280px", minWidth: 0 }}>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.25} alignItems="center">
            <Typography variant="h1">{org.raisonSocialeNom}</Typography>
            <Chip label={LIBELLES[org.etape]} color="primary" />
            <Chip label={TYPES_ORGANISATION[org.type]} />
            {org.priorite && <Chip label={`Priorité ${PRIORITES[org.priorite]}`} color={org.priorite === "A_PLUS" || org.priorite === "A" ? "primary" : "default"} variant="outlined" />}
            {pastille && <PastilleTemperature valeur={pastille} avecMot grande />}
          </Stack>
          <Typography sx={{ fontSize: 15, mt: 0.5 }} color={age.depasse ? "warning.main" : "text.secondary"}>{SOUS_TITRES[org.etape]} · dans cette étape depuis {age.jours} j{taille ? ` · ${taille}` : ""}</Typography>
          <SuiviPoc org={org} />
          {org.raisonSortie && <Typography variant="body2" color="text.secondary">{org.raisonSortieCode ? LIBELLES_RAISONS[org.raisonSortieCode] : "Raison notée"} : {org.raisonSortie}</Typography>}
          {org.etape === "PERDU" && org.raisonSortieCode === "CONCURRENT" && <Typography variant="body2" color="text.secondary">
            {gagnant ? <>Perdu contre <Link href={`/pilot/concurrents/${gagnant.id}`}>{gagnant.nom}</Link></>
              : "Concurrent gagnant non désigné. Dans « Changer d'étape », choisissez « Corriger la sortie »."}
          </Typography>}
          {org.etape === "EN_SOMMEIL" && org.reveilLe && <Typography variant="body2" color="text.secondary">Reprise prévue le {date(org.reveilLe)}</Typography>}
        </Box>
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
          <ChangerEtape org={org} concurrents={concurrents} contratsActifs={montantsModifiables ? contrats.filter((c) => c.statut === "ACTIF").length : 0} />
          <ConvertirClient organisationId={org.id} etape={org.etape} propositions={propositions} montantsModifiables={montantsModifiables}
            accepter={(id) => { setAcceptation(id); ouvrirOnglet("negociation"); }}
            termine={(texte) => { setMessage(texte); router.refresh(); }} />
          <Button variant="outlined" onClick={() => setDialogue({ type: "organisation" })}>Modifier</Button>
          {moi.superAdmin && <BoutonSupprimerFiche organisationId={org.id} nom={org.raisonSocialeNom} />}
          <BoutonDemander organisationId={org.id} comptes={comptes} moi={moi} />
          <Button variant="contained" component={Link} href={`/pilot/organisations/${org.id}?onglet=chronologie&saisir=1`}>Noter un échange</Button>
        </Stack>
      </Stack>
      <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={4} sx={{ pt: 0.5 }}>
        <Fait libelle="Prochaine action" valeur={<>
          <Box component="span" sx={enRetard ? { color: "error.main" } : undefined}>{org.prochaineAction ?? "Aucune"}{org.prochaineActionLe ? ` · ${date(org.prochaineActionLe)}` : ""}</Box>
          {org.prochaineAction ? <ActionsSuivi organisationId={org.id} le={org.prochaineActionLe} /> :
            <Button size="small" component={Link} href={`/pilot/organisations/${org.id}?onglet=chronologie&saisir=1`}>Planifier</Button>}
        </>} />
        <Fait libelle="Commercial" valeur={<>{org.commercial ?? <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>Non attribué</Box>}
          {peutModifier && <Button size="small" onClick={() => setDialogue({ type: "equipe", role: "responsableId" })}>{org.commercial ? "Changer" : "Attribuer"}</Button>}</>} />
        <Fait libelle="Chef de projet" valeur={org.chefDeProjet ? <>{org.chefDeProjet}
          {peutModifier && <Button size="small" onClick={() => setDialogue({ type: "equipe", role: "chefDeProjetId" })}>Changer</Button>}</> : <>
          <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>Non attribué</Box>
          <Button size="small" onClick={() => setDialogue({ type: "equipe", role: "chefDeProjetId" })}>Attribuer</Button>
        </>} />
        {org.apporteur && <Fait libelle="Apporté par" valeur={<>{org.apporteur}
          <Button size="small" component={Link} href={`/pilot/apports?groupe=${org.id}`}>Apport d&apos;affaires</Button></>} />}
        <Fait libelle="Dernier échange" valeur={org.dernierEchange ? `${LIBELLES_ECHANGE[org.dernierEchange.type]} · ${date(org.dernierEchange.surveneuLe)}` : "Aucun"} />
        <Fait libelle="Montant par mois" valeur={montant?.centimes != null ? <>
          {eurosPrecis(montant.centimes)} / mois
          <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>· {montant.libelle}</Box>
        </> : montant ? <>
          <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
            {montantsModifiables ? montant.libelle : montant.libelle === CONTRAT_A_SAISIR ? CONTRAT_A_SAISIR_SANS_DROIT : CONTRAT_EN_BROUILLON_SANS_DROIT}
          </Box>
          {montantsModifiables && boutonMontant}
        </> : <>
          <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
            {montantsModifiables ? "Aucun montant. Ajoutez une estimation dans l'onglet Argent." : "Aucun montant. Un compte qui modifie les montants peut ajouter une estimation."}
          </Box>
          {montantsModifiables && boutonMontant}
        </>} />
      </Stack>
    </Stack>
    <Tabs value={onglet} onChange={(_, v: Onglet) => ouvrirOnglet(v)} aria-label="Fiche organisation" sx={{ "& .MuiTabs-flexContainer": { flexWrap: "wrap" } }}>
      {Object.entries(ONGLETS).map(([id, libelle]) => <Tab key={id} value={id} label={libelle} id={`onglet-${id}`} aria-controls={`panneau-${id}`} />)}
    </Tabs>
    {abonnement && <DialogueAbonnement organisationId={org.id} catalogue={catalogue} fermer={() => setAbonnement(false)} termine={(t) => { setAbonnement(false); setMessage(t); router.refresh(); }} />}
    <Box role="tabpanel" id={`panneau-${onglet}`} aria-labelledby={`onglet-${onglet}`} tabIndex={0}>
      {onglet === "resume" && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2.5, alignItems: "start" }}>
        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          {alertes.length > 0 && <Bloc icone={IconBell} teinte="rouge" titre="Alertes" nombre={alertes.length}>{alertes.map((a) => <LigneAlerte key={a.cle} alerte={a} confier={peutConfier} />)}</Bloc>}
          <Bloc icone={IconId} teinte="indigo" titre="Identité" entete={<Stack direction="row">
            {peutModifier && <Button size="small" onClick={() => setDialogue({ type: "annuaire" })}>Annuaire</Button>}
            <Button size="small" onClick={() => setDialogue({ type: "organisation" })}>Modifier</Button>
          </Stack>}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: "12px 24px", px: 2.5, pt: 0.5, pb: 2.25 }}>
              <Identite libelle="Type" valeur={TYPES_ORGANISATION[org.type]} />
              <Identite libelle="SIREN" valeur={org.siren ? <>{org.siren.replace(/(\d{3})(?=\d)/g, "$1 ")}{" · "}
                <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${org.siren}`} target="_blank" rel="noopener noreferrer">Annuaire</a>{" · "}
                <a href={`https://www.pappers.fr/entreprise/${org.siren}`} target="_blank" rel="noopener noreferrer">Pappers</a></> : null}
                absent={peutModifier ? "À chercher dans l'annuaire" : undefined} />
              <Identite libelle="Dénomination légale" valeur={org.denominationLegale && org.denominationLegale !== org.raisonSocialeNom
                ? [org.denominationLegale, org.formeJuridique].filter(Boolean).join(" · ") : org.formeJuridique} />
              <Identite libelle="Siège" valeur={[org.siegeAdresse, [org.siegeCodePostal, org.siegeVille].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null} />
              <Identite libelle="Activité" valeur={libelleActivite(org.codeNaf ?? null)} />
              <Identite libelle="RIS utilisé" valeur={org.ris ? [org.ris, org.risVersion].filter(Boolean).join(" · version ") : null} />
              <Identite libelle="Prise de RDV aujourd'hui" valeur={org.outilRdv} />
              <Identite libelle="Compte client sur le Dashboard" valeur={org.emailDashboard} absent="Pas encore créé" />
              <Identite libelle="Appels estimés / jour" valeur={org.volumeAppelsEstime} />
              <Identite libelle="Sites" valeur={sites} />
              <Identite libelle="Salles" valeur={org.nombreSalles} />
              <Identite libelle="Secrétaires" valeur={org.nombreSecretaires} />
              <Identite libelle="Équipements" valeur={resumeEquipements(org)} />
              <Identite libelle="Origine du contact" valeur={org.origine ? ORIGINES[org.origine as CleOrigine] ?? org.origine : null} />
              <Identite libelle="GHT ou groupe" valeur={org.rattachementGht} />
              <Identite libelle="Standard" valeur={org.telephone ? <a href={`tel:${org.telephone.replace(/[^\d+]/g, "")}`}>{org.telephone}</a> : null} />
              <Identite libelle="Site web" valeur={org.siteWeb ? <a href={org.siteWeb} target="_blank" rel="noopener noreferrer">{org.siteWeb.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}</a> : null} />
              <Identite libelle="Email du standard" valeur={org.email ? <a href={`mailto:${org.email}`}>{org.email}</a> : null} />
            </Box>
            {org.blocagesTechniques.length > 0 && <Box sx={{ px: 2.5, pb: 2.25 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>Ce qui bloque le déploiement</Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
                {org.blocagesTechniques.map((b) => <Chip key={b} color="warning" label={BLOCAGES_TECHNIQUES[b as CleBlocage] ?? b} />)}
              </Stack>
            </Box>}
          </Bloc>
          <TemperatureOrganisation organisationId={org.id} temperature={temperature} modifiable={peutModifier}
            agir={(action) => {
              if (action === "contact") { ouvrirOnglet("contacts"); setDialogue({ type: "contact", principal: !org.contacts.length }); }
              else setDialogue({ type: "organisation" });
            }} />
          <QualificationOrganisation org={org} />
          {org.notes?.trim() && <Notes texte={org.notes.trim()} />}
        </Stack>
        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          <BlocSupport organisationId={org.id} sujets={sujetsSupport} />
          <BlocCommentaires organisationId={org.id} fil={commentaires} cibles={cibles} moi={moi} />
          <Bloc icone={IconSend} teinte="violet" titre="Demandes en cours" nombre={demandes.length}
            vide={!demandes.length && "Aucune demande en cours. Demandez à un collègue de rappeler le client, de relancer EDL ou de tester les créneaux."}
            entete={<BoutonDemander organisationId={org.id} comptes={comptes} moi={moi} libelle="Nouvelle" variante="text" />}>
            {demandes.map((d) => <LigneDemande key={d.id} demande={d} moi={moi} afficherClient={false} />)}
          </Bloc>
          <DecisionAttendue org={org} />
          <SolutionActuelle org={org} concurrents={concurrents} />
          <Bloc icone={IconListCheck} teinte="violet" titre="À compléter" nombre={complements.length} vide={!complements.length && "Fiche complète."}>
            {complements.map((c) => <Ligne key={c.libelle} nom={c.libelle}><Button onClick={() => completer(c)}>Renseigner</Button></Ligne>)}
          </Bloc>
          <Bloc icone={IconMessageCircle} teinte="bleu" titre="Dernier échange">
            <Box sx={{ px: 2.5, pt: 0.5, pb: 2.25 }}>
              {org.dernierEchange ? <>
                <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center">
                  <Chip label={LIBELLES_ECHANGE[org.dernierEchange.type]} /><Typography variant="body2" color="text.secondary">{date(org.dernierEchange.surveneuLe)}</Typography>
                </Stack>
                {org.dernierEchange.compteRendu && <Typography sx={{ mt: 1 }}>{org.dernierEchange.compteRendu}</Typography>}
              </> : <Typography variant="body2" color="text.secondary">Aucun échange noté.</Typography>}
              <Button variant="outlined" sx={{ mt: 1.5 }} onClick={() => ouvrirOnglet("chronologie")}>Noter un échange</Button>
            </Box>
          </Bloc>
        </Stack>
      </Box>}
      {onglet === "contacts" && <Stack spacing={2}>
        {!org.contacts.length && <Typography color="text.secondary">Aucun contact. Ajoutez le décideur en premier.</Typography>}
        {org.contacts.map((c) => <Card key={c.id}><CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography fontWeight={600}>{c.nom}{c.principal ? " · principal" : ""}{c.facturation ? " · factures" : ""}</Typography>
              <Typography variant="body2" color="text.secondary">{[c.metier, c.fonction, ROLES_CONTACT[c.roleDecision]].filter(Boolean).join(" · ")}</Typography>
              <Typography variant="body2" color="text.secondary">{[c.email, c.telephone].filter(Boolean).join(" · ")}</Typography>
              <Chip size="small" variant="outlined" label={LIBELLES_ATTITUDE[c.attitude]} sx={{ mt: 1 }} />
              <Typography variant="caption" display="block" color="text.secondary">{c.dernierContactLe ? `Dernier contact le ${date(c.dernierContactLe)}` : "Jamais contacté"}</Typography>
            </Box>
            <Stack direction="row" alignItems="flex-start">
              <Button aria-label={`Modifier le contact ${c.nom}`} onClick={() => setDialogue({ type: "contact", contact: c })}>Modifier</Button>
              <Button aria-label={`Supprimer le contact ${c.nom}`} onClick={() => setDialogue({ type: "suppression", contact: c })}>Supprimer</Button>
            </Stack>
          </Stack>
        </CardContent></Card>)}
        <Box><Button variant="outlined" onClick={() => setDialogue({ type: "contact" })}>Ajouter un contact</Button></Box>
      </Stack>}
      {onglet === "negociation" && <NegociationOrganisation organisationId={org.id} etape={org.etape} propositions={propositions} opportunites={opportunites} jalons={jalons} catalogue={catalogue} centres={org.centres} montantsModifiables={montantsModifiables} contratsActifs={contrats.filter((c) => c.statut === "ACTIF")}
        brouillons={contrats.filter((c) => c.statut === "BROUILLON").map((c) => ({ id: c.id, lignes: c.lignes.length }))} grilleDu={grilleDu}
        acceptation={acceptation} acceptationOuverte={() => setAcceptation(null)} />}
      {onglet === "centres" && <CentresOrganisation centres={org.centres} vagues={org.vagues} catalogue={catalogue} ouvrir={setDialogue} />}
      {onglet === "argent" && <Card><CardContent>
        <Typography variant="h3" gutterBottom>Argent</Typography>
        <LigneArgent libelle="Abonnements signés" valeur={recurrent ? `${eurosPrecis(recurrent)} / mois` : "Aucun contrat actif"} />
        {abonnementASaisir && <Box sx={{ my: 1 }}><Button variant="outlined" onClick={() => setAbonnement(true)}>Saisir l&apos;abonnement</Button></Box>}
        {estime && <LigneArgent libelle="Estimé, contrat à saisir" valeur={estime.centimes > 0
          ? `${eurosPrecis(estime.centimes)} / mois, ${estime.origine}. Il devient signé dès que le contrat est actif.`
          : "Aucun montant pour l'estimer. Saisissez et activez le contrat."} />}
        <LigneArgent libelle="Ventes probables" valeur={opportunites.some((o) => !o.gagneeLe && !o.perdueLe) ? `${eurosPrecis(pondere)} / mois` : "Aucune opportunité ouverte"} />
        {facturation && <CalendrierFacturation organisationId={org.id} initial={facturation} modifiable={montantsModifiables} />}
        <ContratsOrganisation organisationId={org.id} contrats={contrats} catalogue={catalogue} centres={org.centres} montantsModifiables={montantsModifiables} />
        <OpportunitesOrganisation organisationId={org.id} opportunites={opportunites} etape={org.etape} catalogue={catalogue} montantsModifiables={montantsModifiables} />
        {!montantsModifiables && <Typography variant="caption" color="text.secondary">Montants en lecture seule pour votre rôle.</Typography>}
      </CardContent></Card>}
      {onglet === "chronologie" && <Card><CardContent>
        <Typography variant="h3" gutterBottom>Chronologie</Typography>
        <JournalEchanges organisationId={org.id} contacts={org.contacts.map((c) => ({ id: c.id, nom: c.nom }))} chronologieInitiale={historique} moi={moi} />
      </CardContent></Card>}
    </Box>
    {dialogue && <DialoguesFiche dialogue={dialogue} org={org} comptes={comptes} clients={clients} suggestions={suggestions} catalogue={catalogue} comptesProduits={comptesProduits} compteClientConnu={compteClientConnu}
      fermer={() => setDialogue(null)} termine={(message) => { setDialogue(null); setMessage(message); router.refresh(); }} />}
    <Snackbar open={message !== null} message={message} autoHideDuration={4000} onClose={() => setMessage(null)} />
  </Stack>;
}

function LigneArgent({ libelle, valeur }: { libelle: string; valeur: string }) {
  return <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.5 }}>
    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{libelle}</Typography>
    <Typography variant="body2" fontWeight={500} sx={{ textAlign: "right", minWidth: 0 }}>{valeur}</Typography>
  </Stack>;
}

/** Les notes de l'organisation, en lecture. Au-delà de huit lignes, elles se replient pour ne pas pousser le reste du résumé. */
function Notes({ texte }: { texte: string }) {
  const [ouvert, setOuvert] = useState(false);
  const longues = texte.length > 600 || texte.split("\n").length > 8;
  return <Bloc icone={IconNotes} teinte="gris" titre="Notes"
    entete={longues && <Button size="small" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>{ouvert ? "Réduire" : "Tout afficher"}</Button>}>
    <Typography sx={{ px: 2.5, pt: 0.5, pb: 2.25, whiteSpace: "pre-line", overflowWrap: "anywhere",
      ...(longues && !ouvert ? { display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>{texte}</Typography>
  </Bloc>;
}

/** Un fait de l'en-tête : à portée d'œil sans ouvrir d'onglet. */
function Fait({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return <Box sx={{ py: 1, minWidth: 160 }}>
    <Typography variant="caption" color="text.secondary" component="div">{libelle}</Typography>
    <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1} alignItems="center" sx={{ fontWeight: 500, minHeight: 32 }}>{valeur}</Stack>
  </Box>;
}

function Identite({ libelle, valeur, absent = "Non renseigné" }: { libelle: string; valeur: ReactNode; absent?: string }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" component="div">{libelle}</Typography>
    {valeur !== null ? <Typography fontWeight={500} sx={{ overflowWrap: "anywhere" }}>{valeur}</Typography> : <Typography color="text.secondary">{absent}</Typography>}
  </Box>;
}
