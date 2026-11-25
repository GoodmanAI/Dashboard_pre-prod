"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Card, Snackbar, Stack, Typography } from "@mui/material";
import { EnTete } from "@/pilot/components/Bloc";
import { envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { ChampsMessage, PastilleStatut, QUI_RECOIT, dateSupport } from "@/pilot/components/formulaires/Support";
import type { SujetDetaille } from "@/pilot/lib/support/charger";
import { DETAILS_STATUT } from "@/pilot/lib/support/regles";
import { changementStatut, nouveauMessage } from "@/pilot/lib/validation/support";
import { lienFiche } from "@/pilot/lib/notifications";
import { JETONS } from "@/pilot/jetons";

type Message = SujetDetaille["fil"][number];

/** Un texte d'un message, dans sa zone : « À dire au client » se copie d'un clic. */
function Zone({ titre, texte, fond, copier }: { titre: string; texte: string; fond: string; copier?: (t: string) => void }) {
  return <Box sx={{ p: 1.75, borderRadius: "12px", bgcolor: fond }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 0.5 }}>
      <Typography variant="subtitle2" component="p">{titre}</Typography>
      {copier && <Button size="small" onClick={() => copier(texte)}>Copier</Button>}
    </Stack>
    <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{texte}</Typography>
  </Box>;
}

function CarteMessage({ m, moiId, copier }: { m: Message; moiId: number; copier: (t: string) => void }) {
  return <Card component="article" sx={{ p: 2.25 }} data-message={m.id}>
    <Stack direction="row" flexWrap="wrap" justifyContent="space-between" gap={1} sx={{ mb: 1.25 }}>
      <Typography fontWeight={600}>{m.auteurId === moiId ? "Vous" : m.auteur}</Typography>
      <Typography variant="body2" color="text.secondary">{dateSupport(m.creeLe)}</Typography>
    </Stack>
    <Stack spacing={1.25}>
      {m.aDireAuClient && <Zone titre="À dire au client" texte={m.aDireAuClient} fond="#ECFDF3" copier={copier} />}
      {m.noteInterne && <Zone titre="Note interne" texte={m.noteInterne} fond={JETONS.surface} />}
    </Stack>
  </Card>;
}

/** Le fil d'un sujet de support (25/11/2026) : messages, réponse, statut. */
export function FilSupport({ sujet, moiId }: { sujet: SujetDetaille; moiId: number }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [cle, setCle] = useState(0);

  const copier = async (t: string) => {
    try { await navigator.clipboard.writeText(t); setInfo("Texte copié. Collez-le dans votre message au client."); }
    catch { setInfo("La copie a échoué. Sélectionnez le texte à la main."); }
  };
  const changer = async (statut: "TRANSMIS" | "RESOLU" | "OUVERT", texte: string) => {
    setErreur(null); setEnvoi(true);
    try { await envoyer(`/api/pilot/support/${sujet.id}`, "PATCH", changementStatut, { statut, majLe: sujet.majLe }); setInfo(texte); router.refresh(); }
    catch (e) { setErreur(e instanceof Error ? e.message : "Le changement a échoué."); }
    finally { setEnvoi(false); }
  };
  const repondre = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErreur(null); setEnvoi(true);
    try {
      await envoyer(`/api/pilot/support/${sujet.id}/messages`, "POST", nouveauMessage,
        { aDireAuClient: String(f.get("aDireAuClient") ?? ""), noteInterne: String(f.get("noteInterne") ?? "") });
      setCle((c) => c + 1); setInfo("Message envoyé, par la cloche et par mail."); router.refresh();
    } catch (err) { setErreur(err instanceof Error ? err.message : "L'envoi a échoué."); }
    finally { setEnvoi(false); }
  };

  return <Stack spacing={2.5} sx={{ maxWidth: 880 }}>
    <EnTete titre={sujet.titre} sousTitre={<>
      <Box component={Link} href={lienFiche(sujet.organisationId)} sx={{ color: "inherit", fontWeight: 500 }}>{sujet.client}</Box>
      {` · Commercial : ${sujet.commercial ?? "pas encore choisi"} · Ouvert par ${sujet.auteur ?? "un compte supprimé"} le ${dateSupport(sujet.creeLe)}`}
    </>}>
      <PastilleStatut statut={sujet.statut} />
    </EnTete>

    <Card sx={{ p: 2.25 }}>
      <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.5}>
        <Typography sx={{ flex: "1 1 260px" }} color="text.secondary">{DETAILS_STATUT[sujet.statut]}</Typography>
        {sujet.statut === "A_TRANSMETTRE" && <Button variant="contained" disabled={envoi}
          onClick={() => changer("TRANSMIS", "Marqué transmis au client. L'équipe est prévenue.")}>Marquer transmis au client</Button>}
        {sujet.statut !== "RESOLU" && <Button variant="outlined" disabled={envoi}
          onClick={() => changer("RESOLU", "Sujet résolu. L'équipe est prévenue.")}>Marquer résolu</Button>}
        {sujet.statut === "RESOLU" && <Button variant="outlined" disabled={envoi}
          onClick={() => changer("OUVERT", "Sujet rouvert. L'équipe est prévenue.")}>Rouvrir</Button>}
      </Stack>
    </Card>

    {erreur && <Alert severity="error" icon={false} onClose={() => setErreur(null)}>{erreur}</Alert>}

    <Stack spacing={1.5} component="section" aria-label="Messages">
      {sujet.fil.map((m) => <CarteMessage key={m.id} m={m} moiId={moiId} copier={copier} />)}
    </Stack>

    <Card component="form" onSubmit={repondre} key={cle} sx={{ p: 2.25 }} aria-label="Répondre">
      <Stack spacing={2}>
        <Typography variant="subtitle1" component="h2">Répondre</Typography>
        <ChampsMessage />
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.5}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: "1 1 260px" }}>{QUI_RECOIT}</Typography>
          <Button type="submit" variant="contained" disabled={envoi}>Envoyer</Button>
        </Stack>
      </Stack>
    </Card>
    <Snackbar open={info !== null} autoHideDuration={4000} onClose={() => setInfo(null)} message={info} />
  </Stack>;
}
