"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Card, Chip, Stack, Typography } from "@mui/material";
import { IconBell, IconCalendarEvent, IconChecks, IconHourglass, IconMapPin, IconRocket, IconRoute, IconSend } from "@tabler/icons-react";
import { LigneDemande, type Moi } from "@/pilot/components/formulaires/Demandes";
import { LigneCommentaireDuJour } from "@/pilot/components/formulaires/Commentaires";
import { fusionnerPourVous } from "@/pilot/lib/commentaires/affichage";
import { commentairesLusIci, consommerPerime } from "@/pilot/components/pourVous";
import type { CommentairesNonLus } from "@/pilot/lib/commentaires/charger";
import { enRetard as demandeEnRetard } from "@/pilot/lib/demandes/regles";
import type { LigneDemande as Demande } from "@/pilot/lib/demandes/charger";
import type { CrmEtapeCommerciale } from "@prisma/client";
import type { AujourdHui as Donnees } from "@/pilot/lib/aujourdhui/construire";
import { ETAPES_COMMERCIALES, ETAPES_SORTIE, LIBELLES } from "@/pilot/lib/pipeline";
import { LIBELLES_ECHANGE } from "@/pilot/lib/echanges/libelles";
import { ActionsReveil, ActionsSuivi } from "@/pilot/components/formulaires/ActionsSuivi";
import { Nouveautes } from "./Nouveautes";
import { LigneAlerte } from "@/pilot/components/LigneAlerte";
import { ActionsAttente } from "@/pilot/components/formulaires/ActionsAttente";
import { Bascule, Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { Tuile, type Icone } from "@/pilot/components/Tuile";
import { libelleAttente } from "@/pilot/lib/checklist/reglesAttentes";
import { dateCourte, libelleCritique, libelleRetard } from "@/pilot/lib/integration/estimation";
import { compter } from "@/pilot/lib/texte";
import { JETONS, MOUVEMENT, type Teinte } from "@/pilot/jetons";

const GROUPES = [["Avant la signature", "commercial", ETAPES_COMMERCIALES], ["Perdus et en pause", "sorties", ETAPES_SORTIE]] as const;
const COLONNES = { xs: "minmax(0, 1fr)", lg: "minmax(0, 1.35fr) minmax(0, 1fr)" };

/** Une tuile de résumé, comme les listes intelligentes de Rappels : on y lit le compte, on y clique pour descendre à la section. */
function Resume({ titre, nombre, Icone, teinte, cible, urgent }: { titre: string; nombre: number; Icone: Icone; teinte: Teinte; cible: string; urgent?: boolean }) {
  return <Card component="a" href={`#${cible}`} aria-label={`${titre} : ${nombre}`} sx={{
    display: "flex", flexDirection: "column", gap: 1.25, p: 2, minWidth: 0, color: "inherit",
    transition: `box-shadow ${MOUVEMENT.normal} ${MOUVEMENT.courbe}, transform ${MOUVEMENT.appui} ${MOUVEMENT.courbe}`,
    "@media (hover: hover) and (pointer: fine)": { "&:hover": { boxShadow: JETONS.ombreSurvol, transform: "translateY(-1px)" } },
    "&&:hover": { color: "inherit" }, "&:active": { transform: "scale(0.98)" },
  }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Tuile Icone={Icone} teinte={teinte} taille={32} rond />
      <Typography component="span" sx={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: urgent && nombre ? "error.main" : "text.primary" }}>{nombre}</Typography>
    </Stack>
    <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary" }}>{titre}</Typography>
  </Card>;
}

export function AujourdHui({ donnees: d, equipe, demandes, commentaires, moi }: { donnees: Donnees; equipe: boolean; demandes: { pourMoi: Demande[]; envoyeesOuvertes: number }; commentaires: CommentairesNonLus; moi: Moi }) {
  const vue = equipe ? "equipe" : "moi";
  const lienPage = (page: number) => `/pilot?vue=${vue}&page=${page}`;
  const lienEtape = (famille: string, etape: CrmEtapeCommerciale) => etape === "EN_INTEGRATION" ? "/pilot/integrations"
    : etape === "EN_PRODUCTION" ? `/pilot/parc?vue=${vue}`
    // Signé et contrat terminé se lisent dans Ventes, avec leurs dates et leurs tarifs (C-62).
    : etape === "SIGNE" ? `/pilot/ventes?vue=${vue}` : etape === "ARRETE" ? `/pilot/ventes?vue=${vue}&segment=termines`
    : `/pilot/pipeline?vue=${vue}&famille=${famille}`;
  const actions = d.actions;
  const enRetard = actions.filter((o) => o.le < d.debut).length;
  const demandesEnRetard = demandes.pourMoi.filter((x) => demandeEnRetard(x, new Date(d.debut))).length;
  // Un commentaire lu depuis le dernier chargement (ici ou sur une fiche) : la copie gardée par le routeur de Next
  // (retour arrière, menu dans les 30 secondes) est périmée. La page se relit une fois, et masque d'ici là ce qui a été lu.
  const router = useRouter();
  useEffect(() => { if (consommerPerime()) router.refresh(); }, [router]);
  const lusIci = commentairesLusIci();
  const nonLus = commentaires.commentaires.filter((c) => !lusIci.has(c.id));
  // « Pour vous » : les demandes en retard d'abord, puis demandes et commentaires non lus du plus récent au plus ancien.
  // Le compte garde tous les commentaires, la liste les 50 plus récents.
  const pourVous = fusionnerPourVous(demandes.pourMoi, nonLus, new Date(d.debut));
  const totalCommentaires = Math.max(0, commentaires.total - (commentaires.commentaires.length - nonLus.length));
  const nombrePourVous = demandes.pourMoi.length + totalCommentaires;
  const total = actions.length + d.rendezVous.length + d.sansAction.length + d.alertes.length + d.promesses.length + d.attentes.length + nombrePourVous;
  return <Stack spacing={3}>
    <EnTete titre="Aujourd'hui" sousTitre={<>
      <Box component="span" sx={{ "&::first-letter": { textTransform: "uppercase" }, display: "inline-block" }}>{new Date(d.debut).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</Box>
      {" · "}{compter(total, "chose demande une action", "choses demandent une action", "Rien à traiter")}
    </>}>
      <Bascule libelle="Dossiers affichés" equipe={equipe} moi="/pilot" tous="/pilot?vue=equipe" />
    </EnTete>

    <Box component="nav" aria-label="Résumé de la journée" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(5, minmax(0, 1fr))" } }}>
      <Resume titre={enRetard ? `À faire, dont ${enRetard} en retard` : "À faire"} nombre={actions.length} Icone={IconChecks} teinte="orange" cible="a-faire" urgent={enRetard > 0} />
      <Resume titre="Rendez-vous" nombre={d.rendezVous.length} Icone={IconCalendarEvent} teinte="bleu" cible="rendez-vous" />
      <Resume titre="Alertes" nombre={d.alertes.length} Icone={IconBell} teinte="rouge" cible="alertes" />
      <Resume titre="Relances à faire" nombre={d.attentes.length} Icone={IconHourglass} teinte="jaune" cible="relances" />
      <Resume titre={demandesEnRetard ? `Pour vous, dont ${demandesEnRetard} en retard` : "Pour vous"} nombre={nombrePourVous} Icone={IconSend} teinte="violet" cible="pour-vous" urgent={demandesEnRetard > 0} />
    </Box>

    <Card component="section" aria-label="Où en sont les prospects" sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" } }}>
      {GROUPES.map(([nom, famille, etapes]) => {
        const presentes = etapes.flatMap((etape) => {
          const nombre = d.compteurs.find((c) => c.etape === etape)?._count._all ?? 0;
          return nombre ? [{ etape, nombre }] : [];
        });
        return <Box key={nom} sx={{ px: 2.75, py: 2, "& + &": { borderLeft: { md: `1px solid ${JETONS.filetInterne}` }, borderTop: { xs: `1px solid ${JETONS.filetInterne}`, md: 0 } } }}>
          <Typography variant="caption" component="div" color="text.secondary" fontWeight={600} sx={{ mb: 1.25 }}>{nom}</Typography>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
            {presentes.map(({ etape, nombre }) => <Box key={etape} component={Link} href={lienEtape(famille, etape)}
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, height: 30, px: 1.5, borderRadius: 999, bgcolor: JETONS.gris, fontSize: 13, fontWeight: 500,
                transition: `background-color ${MOUVEMENT.rapide}`, "&:hover": { bgcolor: JETONS.accentFond } }}>
              {LIBELLES[etape]} <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}>{nombre}</Box>
            </Box>)}
            {!presentes.length && <Typography variant="body2" color="text.secondary">Aucun prospect à ces étapes.</Typography>}
          </Stack>
        </Box>;
      })}
    </Card>

    <Box sx={{ display: "grid", gridTemplateColumns: COLONNES, gap: 2.5, alignItems: "start" }}>
      <Stack spacing={2.5} sx={{ minWidth: 0 }}>
        <Bloc id="a-faire" titre="À faire" icone={IconChecks} teinte="orange" nombre={actions.length} vide={!actions.length && "Rien en retard. Les prochaines actions datées apparaîtront ici."} lien="/pilot/pipeline" action="Voir les prospects" sx={{ scrollMarginTop: 72 }}>
          {actions.map((o) => {
            const retard = o.le < d.debut;
            return <Ligne key={`${o.id}-${o.nature}`} nom={<><Nom id={o.id} nom={o.raisonSocialeNom} />{o.nature === "reveil" && <Chip label="Fin de pause" sx={{ ml: 1 }} />}</>}
              detail={o.nature === "reveil" ? `Reprise prévue le ${dateCourte(o.le)}` : o.prochaineAction}
              date={<Box component="span" sx={retard ? { color: "error.main", fontWeight: 500 } : undefined}>{dateCourte(o.le)}</Box>}>
              {o.nature === "reveil" ? <ActionsReveil organisationId={o.id} reveilLe={o.le} /> : <ActionsSuivi organisationId={o.id} le={o.le} />}
              <Ouvrir id={o.id} />
            </Ligne>;
          })}
        </Bloc>
        <Bloc id="rendez-vous" titre="Rendez-vous" icone={IconCalendarEvent} teinte="bleu" nombre={d.rendezVous.length} vide={!d.rendezVous.length && "Aucun rendez-vous cette semaine. Planifiez-en un depuis la fiche d'un client."} lien="/pilot/pipeline" action="Voir les prospects" sx={{ scrollMarginTop: 72 }}>
          {d.rendezVous.map((e) => {
            const passe = e.surveneuLe < d.debut;
            return <Ligne key={e.id} nom={<><Nom id={e.organisationId} nom={e.nom} />{e.type === "JALON" && <Chip color="info" label={e.aLaChargeDe === "CLIENT" ? "Côté client" : "Côté Lyrae"} sx={{ ml: 1 }} />}</>}
              detail={e.type === "JALON" ? `Étape clé : ${e.libelle ?? "à préciser"}` : LIBELLES_ECHANGE[e.type]}
              date={<Box component="span" sx={passe ? { color: "warning.main", fontWeight: 500 } : undefined}>{dateCourte(e.surveneuLe)}{passe ? " · à confirmer" : ""}</Box>}>
              <ActionsSuivi organisationId={e.organisationId} echangeId={e.id} le={e.surveneuLe} jalon={e.type === "JALON"} /><Ouvrir id={e.organisationId} />
            </Ligne>;
          })}
        </Bloc>
        <Bloc id="alertes" titre="Alertes" icone={IconBell} teinte="rouge" nombre={d.alertes.length} vide={!d.alertes.length && "Aucune alerte. Tout est à jour."} lien="/pilot/alertes" action="Toutes les alertes" sx={{ scrollMarginTop: 72 }}>
          {d.alertes.map((a) => <LigneAlerte key={a.cle} alerte={a} confier={d.peutConfier} />)}
        </Bloc>
      </Stack>
      <Stack spacing={2.5} sx={{ minWidth: 0 }}>
        <Bloc id="pour-vous" titre="Pour vous" icone={IconSend} teinte="violet" nombre={nombrePourVous} sx={{ scrollMarginTop: 72 }}
          vide={!pourVous.length && (demandes.envoyeesOuvertes ? `Rien ne vous est demandé et aucun commentaire n'est à lire. Vous attendez ${demandes.envoyeesOuvertes} réponse${demandes.envoyeesOuvertes > 1 ? "s" : ""} de vos collègues.` : "Rien ne vous est demandé et aucun commentaire n'est à lire. Les demandes et les commentaires qui vous préviennent arrivent ici.")}
          lien="/pilot/demandes" action="Toutes les demandes">
          {pourVous.map((e) => e.genre === "demande"
            ? <LigneDemande key={e.cle} demande={e.demande} moi={moi} />
            : <LigneCommentaireDuJour key={e.cle} commentaire={e.commentaire} />)}
          {totalCommentaires > nonLus.length && <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2.75, py: 1.5 }}>
            Les {nonLus.length} commentaires les plus récents sont affichés, sur {totalCommentaires} non lus. Les autres se lisent sur la fiche du client.
          </Typography>}
        </Bloc>
        <Nouveautes utilisateurId={d.utilisateurId} />
        <Bloc titre="Clients sans prochaine action" icone={IconRoute} teinte="violet" nombre={d.sansAction.length} vide={!d.sansAction.length && "Chaque client en cours a sa prochaine action."} lien="/pilot/pipeline" action="Voir les prospects">
          {d.sansAction.map((o) => <Ligne key={o.id} nom={<Nom id={o.id} nom={o.raisonSocialeNom} />}
            detail={<Box component="span" sx={{ color: "warning.main" }}>{o.prochaineAction ? `${o.prochaineAction} · date à préciser` : "Aucune prochaine action"}</Box>}>
            <Button component={Link} href={`/pilot/organisations/${o.id}?onglet=chronologie&saisir=1`} variant="outlined">Planifier</Button>
          </Ligne>)}
        </Bloc>
        <Bloc titre="Mises en service promises sous 14 jours" icone={IconRocket} teinte="vert" nombre={d.promesses.length} vide={!d.promesses.length && "Aucune mise en service promise dans les 14 jours. La date se pose depuis la fiche du client."} lien="/pilot/integrations" action="Voir les mises en service">
          {d.promesses.map((r) => <Ligne key={r.id} nom={<><Nom id={r.organisationId} nom={r.nom} /> · {r.centre} · {r.produit}</>}
            detail={<>
              <Box>Promise le {dateCourte(r.datePromise)}</Box>
              <Box data-ecart={r.ecartJours} sx={r.ecartJours > 0 ? { color: "warning.main", fontWeight: 500 } : undefined}>Estimée au {dateCourte(r.dateRealiste)}, {libelleRetard(r.ecartJours)}</Box>
              <Box sx={r.bloquantes ? { color: "warning.main" } : undefined}>{compter(r.bloquantes, "étape bloquante ouverte", "étapes bloquantes ouvertes", "Rien de bloquant")}{r.etapeCritique ? ` · ${libelleCritique(r.etapeCritique)}` : ""}</Box>
            </>}>
            <Button component={Link} href={`/pilot/integrations?organisationId=${r.organisationId}&centreProduitId=${r.id}`} variant="outlined">Voir les étapes</Button>
          </Ligne>)}
        </Bloc>
        <Bloc id="relances" titre="Relances à faire" icone={IconHourglass} teinte="jaune" nombre={d.attentes.length} vide={!d.attentes.length && "Personne à relancer aujourd'hui."} lien={equipe ? "/pilot/attentes" : "/pilot/attentes?aMoi=1"} action="Toutes les relances" sx={{ scrollMarginTop: 72 }}>
          {d.attentes.map((e) => <Ligne key={e.id} nom={<>{libelleAttente(e.enAttenteDe!)} · {e.organisationNom}</>}
            detail={<>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><IconMapPin size={14} />{e.centreNom} · {e.produit} · {e.libelle}</Box>
              <Box sx={{ color: "warning.main" }}>{e.derniereRelanceLe ? `relancé le ${dateCourte(e.derniereRelanceLe)}` : "jamais relancé"}</Box>
            </>}>
            <ActionsAttente id={e.id} levee={false} libelle="Relancé aujourd'hui" />
          </Ligne>)}
        </Bloc>
      </Stack>
    </Box>
    {(d.suite || d.page > 1) && <Stack direction="row" spacing={2} alignItems="center">
      <Typography variant="caption" color="text.secondary">Page {d.page}. 50 lignes au plus par bloc.</Typography>
      {d.page > 1 && <Button component={Link} href={lienPage(d.page - 1)}>Page précédente</Button>}
      {d.suite && <Button component={Link} href={lienPage(d.page + 1)}>Page suivante</Button>}
    </Stack>}
  </Stack>;
}
function Nom({ id, nom }: { id: number; nom: string }) { return <Link href={`/pilot/organisations/${id}`}>{nom}</Link>; }
function Ouvrir({ id }: { id: number }) { return <Button component={Link} href={`/pilot/organisations/${id}`} variant="outlined">Ouvrir</Button>; }
