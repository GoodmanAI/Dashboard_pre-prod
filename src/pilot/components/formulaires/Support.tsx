"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { IconLifebuoy } from "@tabler/icons-react";
import { Bloc, Ligne } from "@/pilot/components/Bloc";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";
import type { LigneSujet } from "@/pilot/lib/support/charger";
import { DETAILS_STATUT, LIBELLES_STATUT, lienSujet, type StatutSujet } from "@/pilot/lib/support/regles";
import { LONGUEUR_MESSAGE_SUPPORT, nouveauSujet } from "@/pilot/lib/validation/support";

/**
 * Les briques du support (25/11/2026) : pastille de statut, ligne d'un sujet, ouverture
 * d'un sujet, bloc de la fiche client. Plan lyrae/plans/2026-11-support-dans-pilot.md.
 */
const COULEURS: Record<StatutSujet, { fond: string; texte: string }> = {
  A_TRANSMETTRE: { fond: "#FFEDE0", texte: "#B34700" },
  OUVERT: { fond: "#E8F1FC", texte: "#0058B0" },
  TRANSMIS: { fond: "#E3F7EA", texte: "#1E7A3C" },
  RESOLU: { fond: "#F2F2F7", texte: "#48484A" },
};

export function PastilleStatut({ statut }: { statut: StatutSujet }) {
  const c = COULEURS[statut];
  return <Box component="span" title={DETAILS_STATUT[statut]} sx={{ display: "inline-flex", alignItems: "center", height: 24, px: 1.25, borderRadius: "12px",
    fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", bgcolor: c.fond, color: c.texte }}>{LIBELLES_STATUT[statut]}</Box>;
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const dateSupport = (iso: string) => DATE.format(new Date(iso));

/** Un sujet dans une liste : titre, client et commercial, dernière activité, statut. */
export function LigneSujetSupport({ sujet, avecClient = true }: { sujet: LigneSujet; avecClient?: boolean }) {
  const detail = [avecClient && sujet.client, `Commercial : ${sujet.commercial ?? "pas encore choisi"}`, `${sujet.messages} message${sujet.messages > 1 ? "s" : ""}`]
    .filter(Boolean).join(" · ");
  return <Ligne data-sujet={sujet.id} nom={<Box component={Link} href={lienSujet(sujet.id)} sx={{ color: "inherit", "&:hover": { textDecoration: "underline" } }}>{sujet.titre}</Box>}
    detail={detail} date={`Dernière activité : ${dateSupport(sujet.majLe)}`}>
    <PastilleStatut statut={sujet.statut} />
  </Ligne>;
}

export const RAPPEL_PATIENT = "Ce message part aussi par mail : ne nommez aucun patient et ne donnez aucun numéro de dossier.";
export const QUI_RECOIT = "Le commercial du client le reçoit en premier, toute l'équipe en copie, dans la cloche et par mail.";

/** Les deux zones d'un message : ce qu'il faut dire au client, et la note pour l'équipe. */
export function ChampsMessage({ autoFocus = false }: { autoFocus?: boolean }) {
  return <>
    <TextField name="aDireAuClient" label="À dire au client" multiline minRows={3} fullWidth autoFocus={autoFocus}
      inputProps={{ maxLength: LONGUEUR_MESSAGE_SUPPORT }}
      helperText="Le texte que le commercial transmet tel quel au client. Il le copie d'un clic." />
    <TextField name="noteInterne" label="Note interne" multiline minRows={2} fullWidth inputProps={{ maxLength: LONGUEUR_MESSAGE_SUPPORT }}
      helperText="Le contexte pour l'équipe : la cause, ce qui a été corrigé, ce qu'il reste à vérifier." />
    <Typography variant="body2" color="text.secondary">{RAPPEL_PATIENT}</Typography>
  </>;
}

const texteDe = (f: FormData, nom: string) => String(f.get(nom) ?? "");

/** Ouvre un sujet. Sur la fiche d'un client, le client est déjà choisi. */
export function DialogueNouveauSujet({ clients, organisationId, fermer }: {
  clients?: { id: number; nom: string }[]; organisationId?: number; fermer: () => void;
}) {
  const router = useRouter();
  const [client, setClient] = useState<number | "">(organisationId ?? "");
  return <DialogueFormulaire titre="Nouveau sujet de support" bouton="Ouvrir le sujet" maxWidth="md" fermer={fermer} soumettre={async (f) => {
    const { sujet } = await envoyer<{ sujet: { id: number } }>("/api/pilot/support", "POST", nouveauSujet, {
      organisationId: client === "" ? undefined : client, titre: texteDe(f, "titre"),
      aDireAuClient: texteDe(f, "aDireAuClient"), noteInterne: texteDe(f, "noteInterne"),
    });
    router.push(lienSujet(sujet.id));
  }}>
    {organisationId === undefined && <TextField select label="Client" required value={client} fullWidth
      onChange={(e) => setClient(Number(e.target.value))} helperText="Son commercial le reçoit en premier.">
      {(clients ?? []).map((c) => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
    </TextField>}
    <TextField name="titre" label="Sujet" required fullWidth autoFocus inputProps={{ maxLength: 160 }}
      helperText="En quelques mots : « SMS de confirmation qui ne partent plus », « Créneaux d'IRM absents »." />
    <ChampsMessage />
    <Typography variant="body2" color="text.secondary">{QUI_RECOIT}</Typography>
  </DialogueFormulaire>;
}

/** Le bloc « Support » de la fiche d'un client : ses sujets et l'ouverture d'un nouveau. */
export function BlocSupport({ organisationId, sujets }: { organisationId: number; sujets: LigneSujet[] }) {
  const [ouvert, setOuvert] = useState(false);
  const enCours = sujets.filter((s) => s.statut !== "RESOLU").length;
  return <Bloc id="support" titre="Support" icone={IconLifebuoy} teinte="orange" nombre={enCours || undefined}
    entete={<Button size="small" variant="outlined" onClick={() => setOuvert(true)} sx={{ ml: "auto" }}>Nouveau sujet</Button>}
    vide={!sujets.length && "Aucun sujet de support pour ce client."}>
    <Stack>{sujets.map((s) => <LigneSujetSupport key={s.id} sujet={s} avecClient={false} />)}</Stack>
    {ouvert && <DialogueNouveauSujet organisationId={organisationId} fermer={() => setOuvert(false)} />}
  </Bloc>;
}
