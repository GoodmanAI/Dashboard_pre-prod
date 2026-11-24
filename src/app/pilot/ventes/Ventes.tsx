"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Card, Chip, Snackbar, Stack, Typography } from "@mui/material";
import { Bascule, EnTete, LienAccent, Vide } from "@/pilot/components/Bloc";
import { AfficherCalendrierFacturation } from "@/pilot/components/CalendrierFacturation";
import { euros } from "@/pilot/lib/argent";
import { compter } from "@/pilot/lib/texte";
import { LIBELLES } from "@/pilot/lib/pipeline";
import { LIBELLES_CONTRAT } from "@/pilot/lib/contrats/regles";
import { LIBELLES_RECONDUCTION } from "@/pilot/lib/ventes/regles";
import type { ContratVue, DateCleVue, ProduitVue, Segment, VenteVue } from "@/pilot/lib/ventes/charger";
import { DialogueContrat } from "../organisations/[id]/DialoguesContrat";
import { DialogueSaisie } from "../organisations/[id]/JournalEchanges";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";

type Dialogue = { type: "contrat"; vente: VenteVue; contrat: ContratVue }
  | { type: "echange"; vente: VenteVue; quoi: "FORMATION" | "INTERFACAGE" };

const SEGMENTS: { cle: Segment; nom: string; detail: string }[] = [
  { cle: "en_cours", nom: "En cours", detail: "Signés, en mise en service ou en service" },
  { cle: "a_completer", nom: "À compléter", detail: "Contrat absent, en brouillon ou incomplet" },
  { cle: "termines", nom: "Terminés", detail: "Contrats arrivés à leur fin" },
];

// Fuseau explicite : le serveur et le navigateur affichent le même jour.
const date = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** « la durée, la reconduction et les tarifs ». */
const enumerer = (mots: string[]) => mots.length < 2 ? mots.join("") : `${mots.slice(0, -1).join(", ")} et ${mots.at(-1)}`;
const fiche = (id: number, onglet?: string) => `/pilot/organisations/${id}${onglet ? `?onglet=${onglet}` : ""}`;

/**
 * Ventes (CHOIX.md, C-62) : ce qui a été vendu, client par client, dans l'ordre
 * où ça se passe. Formation, interfaçage, essai, début officiel, durée,
 * reconduction, puis les produits et les tarifs. Une case vide dit pourquoi.
 */
export function Ventes({ facturationVisible, equipe, segment, ventes, mensuelCentimes, comptes, modifiable }: {
  equipe: boolean; segment: Segment; ventes: VenteVue[]; mensuelCentimes: number;
  comptes: Record<Segment, number>; modifiable: boolean; facturationVisible: boolean;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const vue = equipe ? "equipe" : "moi";
  const lien = (s: Segment, v = vue) => `/pilot/ventes?vue=${v}&segment=${s}`;
  const termine = (texte: string) => { setDialogue(null); setMessage(texte); router.refresh(); };
  const vide = segment === "a_completer" ? "Rien à compléter : chaque client signé a un contrat actif, daté et tarifé."
    : segment === "termines" ? "Aucun contrat terminé."
    : equipe ? "Aucun client signé pour l'instant. Un prospect arrive ici dès qu'il passe à Signé."
    : "Aucun client signé à votre nom. Choisissez Toute l'équipe pour voir tout le parc.";

  return <Stack spacing={2.5} sx={{ minWidth: 0 }}>
    <EnTete titre="Ventes" sousTitre={`${compter(comptes.en_cours, "client signé", "clients signés")} · ${euros(mensuelCentimes)} / mois d'abonnements`}>
      <Bascule libelle="Clients affichés" equipe={equipe} moi={lien(segment, "moi")} tous={lien(segment, "equipe")} />
    </EnTete>

    <Box component="nav" aria-label="Clients affichés" sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, p: 0.5, borderRadius: "16px", bgcolor: JETONS.segment }}>
      {SEGMENTS.map(({ cle, nom, detail }) => {
        const actif = cle === segment;
        return <Box key={cle} component={Link} href={lien(cle)} aria-current={actif ? "true" : undefined}
          sx={{ flex: { xs: "1 1 100%", sm: "1 1 200px" }, minWidth: 0, px: 2, py: 1.25, borderRadius: "12px",
            bgcolor: actif ? "background.paper" : "transparent", boxShadow: actif ? JETONS.ombreSegment : "none",
            transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}, box-shadow ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`,
            "&:hover": { bgcolor: actif ? "background.paper" : JETONS.survolPage }, "&&:hover": { color: "text.primary" } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" component="span">{nom}</Typography>
            <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: cle === "a_completer" && comptes[cle] ? "warning.main" : "text.secondary",
              bgcolor: JETONS.gris, borderRadius: 999, px: "7px", py: "1px" }}>{comptes[cle]}</Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" component="div">{detail}</Typography>
        </Box>;
      })}
    </Box>

    {ventes.length ? <Stack spacing={2}>
      {ventes.map((v) => <CarteVente facturationVisible={facturationVisible} key={v.id} vente={v} modifiable={modifiable}
        modifierContrat={(contrat) => setDialogue({ type: "contrat", vente: v, contrat })}
        planifier={(quoi) => setDialogue({ type: "echange", vente: v, quoi })} />)}
    </Stack> : <Vide>{vide}</Vide>}

    <Typography variant="body2" color="text.secondary">
      Les clients pas encore signés sont dans <Box component={Link} href="/pilot/pipeline" sx={{ fontWeight: 500 }}>Prospects</Box>.
    </Typography>

    {dialogue?.type === "contrat" && <DialogueContrat organisationId={dialogue.vente.id} contrat={dialogue.contrat}
      fermer={() => setDialogue(null)} termine={() => termine("Contrat enregistré.")} />}
    {dialogue?.type === "echange" && <DialogueSaisie organisationId={dialogue.vente.id} contacts={dialogue.vente.contacts}
      titre={dialogue.quoi === "FORMATION" ? "Planifier la formation" : "Planifier l'interfaçage"}
      initial={{ type: dialogue.quoi, statut: "PLANIFIE" }}
      fermer={() => setDialogue(null)} termine={() => termine(dialogue.quoi === "FORMATION" ? "Formation planifiée." : "Interfaçage planifié.")} />}
    <Snackbar open={message !== null} message={message} autoHideDuration={4000} onClose={() => setMessage(null)} />
  </Stack>;
}

function CarteVente({ facturationVisible, vente: v, modifiable, modifierContrat, planifier }: {
  vente: VenteVue; modifiable: boolean; facturationVisible: boolean; modifierContrat: (c: ContratVue) => void; planifier: (quoi: "FORMATION" | "INTERFACAGE") => void;
}) {
  const plusieurs = v.contrats.length > 1;
  const enService = v.produits.filter((p) => p.etat === "en_service" || p.etat === "partiel").length;
  const titreId = `vente-${v.id}`;
  return <Card component="article" aria-labelledby={titreId} data-vente={v.id}>
    <Box sx={{ px: 2.75, pt: 2.25, pb: 1.75 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={2} rowGap={0.5} alignItems="baseline">
        <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
          <Typography id={titreId} variant="h2" component={Link} href={fiche(v.id)} sx={{ display: "block", overflowWrap: "anywhere", "&&": { color: "text.primary" }, "&:hover": { textDecoration: "underline" } }}>{v.nom}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {LIBELLES[v.etape]} · {v.commercial ?? "Commercial non attribué"}{v.chefDeProjet ? ` · Chef de projet : ${v.chefDeProjet}` : ""}
          </Typography>
        </Box>
        {v.mensuelCentimes > 0 && <Typography sx={{ fontSize: 17, fontWeight: 600, whiteSpace: "nowrap" }}>{euros(v.mensuelCentimes)} / mois</Typography>}
      </Stack>
      {v.manques.length > 0 && <Typography variant="body2" color="warning.main" fontWeight={500} sx={{ mt: 1 }} data-manques>
        À compléter : {enumerer(v.manques)}.
      </Typography>}
    </Box>

    <Section titre="Calendrier" action={!plusieurs && v.contrats[0] && <ActionsContrat vente={v} contrat={v.contrats[0]} modifiable={modifiable} modifier={modifierContrat} />}>
      <Grille>
        <CaseReunion titre="Formation" d={v.formation} quoi="FORMATION" vente={v} modifiable={modifiable} planifier={planifier} />
        <CaseReunion titre="Interfaçage" d={v.interfacage} quoi="INTERFACAGE" vente={v} modifiable={modifiable} planifier={planifier} />
        {!v.contrats.length && <Box sx={{ gridColumn: "1 / -1" }}>
          <Vide>
            Aucun contrat : l&apos;essai, le début officiel, la durée et la reconduction s&apos;y saisissent.{" "}
            <LienAccent href={fiche(v.id, "argent")}>Saisir le contrat</LienAccent>
          </Vide>
        </Box>}
        {v.contrats.map((c) => <CasesContrat key={c.id} contrat={c} entete={plusieurs && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ gridColumn: "1 / -1", pt: 0.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.reference ?? "Contrat sans référence"}</Typography>
          <ActionsContrat vente={v} contrat={c} modifiable={modifiable} modifier={modifierContrat} />
        </Stack>} />)}
      </Grille>
    </Section>

    {facturationVisible && <AfficherCalendrierFacturation organisationId={v.id} modifiable={modifiable} />}
    <Section titre="Produits" detail={v.produits.length ? `${compter(v.produits.length, "produit")}${enService ? `, ${enService} en service` : ""}` : undefined}>
      {v.produits.length ? <Stack>{v.produits.map((p) => <LigneProduit key={p.productId} p={p} />)}</Stack>
        : <Typography variant="body2" color="text.secondary">Aucun produit : ni centre rattaché, ni ligne de tarif. <LienAccent href={fiche(v.id, "centres")}>Ajouter un produit</LienAccent></Typography>}
    </Section>

    <Section titre="Conditions tarifaires">
      {!v.contrats.length ? <Typography variant="body2" color="text.secondary">Les tarifs se saisissent avec le contrat, sur la fiche du client.</Typography>
        : <Stack spacing={1.5}>{v.contrats.map((c) => <Box key={c.id}>
          {plusieurs && <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>{c.reference ?? "Contrat sans référence"}</Typography>}
          {c.gestes && <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }} data-gestes>{c.gestes}</Typography>}
          {c.tarifs.length ? c.tarifs.map((t) => <Stack key={t.id} direction="row" flexWrap="wrap" useFlexGap columnGap={2} sx={{ py: 0.75, borderBottom: `1px solid ${JETONS.filetInterne}`, "&:last-of-type": { borderBottom: 0 } }}>
            <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Typography variant="body2" fontWeight={500} sx={{ overflowWrap: "anywhere" }}>{t.libelle}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{t.portee}</Typography>
            </Box>
            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>{t.montant}</Typography>
          </Stack>) : <Typography variant="body2" color="text.secondary">
            Aucune ligne de tarif. <LienAccent href={fiche(v.id, "argent")}>Les ajouter sur la fiche</LienAccent>
          </Typography>}
          <Box sx={{ mt: 1, bgcolor: JETONS.gris, borderRadius: "12px", px: 1.75, py: 1.25 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>Conditions particulières</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-line", overflowWrap: "anywhere", color: c.conditionsTarifaires ? "text.primary" : "text.secondary" }}>
              {c.conditionsTarifaires ?? "Aucune. Une remise, une gratuité ou un prix garanti se notent dans le contrat."}
            </Typography>
          </Box>
        </Box>)}</Stack>}
    </Section>
  </Card>;
}

function Section({ titre, detail, action, children }: { titre: string; detail?: string; action?: ReactNode; children: ReactNode }) {
  return <Box component="section" aria-label={titre} sx={{ px: 2.75, pt: 1.75, pb: 2, borderTop: `1px solid ${JETONS.filetInterne}` }}>
    <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1} rowGap={0.5} alignItems="center" sx={{ mb: 1.25, minHeight: 30 }}>
      <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>{titre}</Typography>
      {detail && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>· {detail}</Typography>}
      {action && <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ ml: "auto" }}>{action}</Stack>}
    </Stack>
    {children}
  </Box>;
}

/** Deux colonnes sur téléphone, six sur grand écran : jamais de barre horizontale. */
function Grille({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 136px), 1fr))" }}>{children}</Box>;
}

type Ton = "neutre" | "fait" | "vide" | "alerte";
function Case({ titre, valeur, detail, ton = "neutre", children }: { titre: string; valeur: string; detail?: ReactNode; ton?: Ton; children?: ReactNode }) {
  return <Box data-case={titre} sx={{ bgcolor: JETONS.gris, borderRadius: "12px", px: 1.5, py: 1.25, minWidth: 0, display: "flex", flexDirection: "column" }}>
    <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>{titre}</Typography>
    <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 0.25, color: ton === "vide" ? "text.secondary" : "text.primary", overflowWrap: "anywhere" }}>{valeur}</Typography>
    {detail && <Typography sx={{ fontSize: 12, mt: 0.25, overflowWrap: "anywhere",
      color: ton === "alerte" ? "warning.main" : ton === "fait" ? "success.main" : "text.secondary", fontWeight: ton === "alerte" || ton === "fait" ? 500 : 400 }}>{detail}</Typography>}
    {children && <Box sx={{ mt: "auto", pt: 0.75 }}>{children}</Box>}
  </Box>;
}

function CaseReunion({ titre, d, quoi, vente, modifiable, planifier }: {
  titre: string; d: DateCleVue; quoi: "FORMATION" | "INTERFACAGE"; vente: VenteVue; modifiable: boolean; planifier: (quoi: "FORMATION" | "INTERFACAGE") => void;
}) {
  const nom = quoi === "FORMATION" ? "Formation" : "Interfaçage";
  if (d.etat === "aucune") return <Case titre={titre} valeur={quoi === "FORMATION" ? "Pas planifiée" : "Pas planifié"} ton="vide"
    detail={`Aucun rendez-vous « ${nom} » au journal du client.`}>
    {modifiable && <Button size="small" variant="outlined" onClick={() => planifier(quoi)}>Planifier</Button>}
  </Case>;
  if (d.etat === "a_confirmer") return <Case titre={titre} valeur={date(d.le!)} ton="alerte" detail="Date passée, rendez-vous jamais confirmé. Notez-le comme fait ou replanifiez-le.">
    <LienAccent href={fiche(vente.id, "chronologie")}>Ouvrir le journal</LienAccent>
  </Case>;
  const feminin = quoi === "FORMATION";
  if (d.etat === "prevue") return <Case titre={titre} valeur={date(d.le!)} detail={feminin ? "Prévue" : "Prévu"} />;
  return <Case titre={titre} valeur={date(d.le!)} ton="fait"
    detail={(feminin ? "Faite" : "Fait") + (d.source === "checklist" ? ", d'après la check-list" : "")} />;
}

function CasesContrat({ contrat: c, entete }: { contrat: ContratVue; entete?: ReactNode }) {
  const e = c.essai;
  return <>
    {entete}
    {!e ? <Case titre="Essai du contrat signé" valeur="Aucun" ton="vide" detail="Pas d'essai renseigné dans le contrat." />
      : e.etat === "incomplet" ? <Case titre="Essai du contrat signé" valeur={e.jours !== null ? compter(e.jours, "jour") : "Durée à préciser"} ton="alerte"
        detail={e.debut ? `Commence le ${date(e.debut)}. Indiquez sa durée.` : "Indiquez sa date de début."} />
      : <Case titre="Essai du contrat signé" valeur={compter(e.jours!, "jour")} ton={e.etat === "termine" ? "fait" : "neutre"}
        detail={e.etat === "en_cours" ? `En cours, ${compter(e.joursRestants!, "jour restant", "jours restants")}. Fin le ${date(e.fin!)}.`
          : `${e.etat === "a_venir" ? "À venir" : "Terminé"}, du ${date(e.debut!)} au ${date(e.fin!)}`} />}
    {c.debuteLe ? <Case titre="Début officiel" valeur={date(c.debuteLe)} detail={c.signeLe ? `Signé le ${date(c.signeLe)}` : undefined} />
      : <Case titre="Début officiel" valeur="Non renseigné" ton="alerte"
        detail={c.statut === "BROUILLON" ? "À saisir avant d'activer le contrat."
          : c.signeLe ? `Le chiffre d'affaires compte depuis la signature, le ${date(c.signeLe)}.` : "Sans date, le contrat ne compte pas dans le chiffre d'affaires."} />}
    {c.engagementMois !== null ? <Case titre="Durée" valeur={compter(c.engagementMois, "mois", "mois")}
      detail={c.finEngagement ? `Jusqu'au ${date(c.finEngagement)}` : "Fin calculée dès que le début est saisi."} />
      : <Case titre="Durée" valeur="Non renseignée" ton="alerte" detail="Sans durée, ni fin d'engagement ni préavis ne se calculent." />}
    <CaseReconduction c={c} />
  </>;
}

function CaseReconduction({ c }: { c: ContratVue }) {
  const echeance = c.prochaineEcheance ? (c.reconduction === "AUCUNE" ? `Fin le ${date(c.prochaineEcheance)}` : `Échéance le ${date(c.prochaineEcheance)}`)
    : c.statut === "TERMINE" ? (c.termineLe ? `Terminé le ${date(c.termineLe)}` : "Terminé") : "Prochaine échéance à saisir";
  const preavis = c.preavisMois === null ? "Préavis non renseigné"
    : c.preavisDepasse ? `Préavis de ${c.preavisMois} mois dépassé depuis le ${date(c.limitePreavis!)}`
    : c.limitePreavis ? `Préavis de ${c.preavisMois} mois, à donner avant le ${date(c.limitePreavis)}`
    : `Préavis de ${c.preavisMois} mois`;
  // Seule la ligne qui demande d'agir passe en orange : l'échéance reste une information.
  return <Case titre="Reconduction" valeur={c.reconduction ? LIBELLES_RECONDUCTION[c.reconduction] : "Non renseignée"}
    ton={c.reconduction ? "neutre" : "alerte"} detail={<>{echeance}<br />
      <Box component="span" sx={c.preavisDepasse ? { color: "warning.main", fontWeight: 500 } : undefined}>{preavis}</Box></>} />;
}

function ActionsContrat({ vente, contrat, modifiable, modifier }: { vente: VenteVue; contrat: ContratVue; modifiable: boolean; modifier: (c: ContratVue) => void }) {
  return <>
    {contrat.statut !== "ACTIF" && <Chip label={contrat.statut === "BROUILLON" ? "Brouillon, pas encore actif" : LIBELLES_CONTRAT[contrat.statut]} />}
    {modifiable && contrat.statut !== "TERMINE" && <Button size="small" variant="outlined" onClick={() => modifier(contrat)}>Modifier le contrat</Button>}
    <LienAccent href={fiche(vente.id, "argent")}>Tarifs et lignes</LienAccent>
  </>;
}

function LigneProduit({ p }: { p: ProduitVue }) {
  const etat = p.etat === "en_service" ? `En service depuis le ${date(p.depuisLe!)}`
    : p.etat === "partiel" ? `En service sur ${p.centresEnService} centres sur ${p.centres} depuis le ${date(p.depuisLe!)}`
    : p.etat === "prevu" ? `Mise en service prévue le ${date(p.prevuLe!)}`
    : p.etat === "a_planifier" ? "En mise en service, sans date promise"
    : "Dans le contrat, suivi par aucun centre";
  return <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={2} alignItems="baseline" data-produit={p.nom}
    sx={{ py: 0.75, borderBottom: `1px solid ${JETONS.filetInterne}`, "&:last-of-type": { borderBottom: 0 } }}>
    <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
      <Typography variant="body2" fontWeight={600} component="span">{p.nom}</Typography>
      <Typography variant="body2" color={p.etat === "sans_centre" ? "warning.main" : p.etat === "en_service" ? "text.primary" : "text.secondary"} component="div">
        {p.centres ? `${compter(p.centres, "centre")} · ` : ""}{etat}
      </Typography>
    </Box>
    {p.mensuelCentimes > 0 && <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>{euros(p.mensuelCentimes)} / mois</Typography>}
  </Stack>;
}
