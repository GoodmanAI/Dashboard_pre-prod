"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Alert, Avatar, Box, Button, Snackbar, Stack, TextField, Typography } from "@mui/material";
import { IconCheck, IconKey, IconSend, IconShieldCheck, IconX } from "@tabler/icons-react";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { LONGUEUR_MOT_DE_PASSE, changementMotDePasse } from "@/pilot/lib/validation/acces";
import { JETONS, TEINTES } from "@/pilot/jetons";

type Droit = { texte: string; ouvert: boolean; detail?: string };

/** Choisir son mot de passe : l'actuel, puis le nouveau deux fois. Rien n'est gardé dans la page. */
function DialogueMotDePasse({ fermer, fini }: { fermer: () => void; fini: () => void }) {
  return <DialogueFormulaire titre="Changer mon mot de passe" bouton="Enregistrer" fermer={fermer} soumettre={async (f) => {
    const nouveau = String(f.get("nouveau") ?? "");
    if (nouveau !== String(f.get("confirmation") ?? "")) throw new Error("Les deux saisies du nouveau mot de passe ne sont pas identiques.");
    await envoyer("/api/pilot/compte/mot-de-passe", "POST", changementMotDePasse, { actuel: String(f.get("actuel") ?? ""), nouveau });
    fini();
  }}>
    <TextField name="actuel" label="Mot de passe actuel" type="password" autoComplete="current-password" required fullWidth autoFocus />
    <TextField name="nouveau" label="Nouveau mot de passe" type="password" autoComplete="new-password" required fullWidth
      helperText={`Au moins ${LONGUEUR_MOT_DE_PASSE.min} signes. Une phrase courte se retient mieux qu'un mot compliqué.`} />
    <TextField name="confirmation" label="Nouveau mot de passe, encore une fois" type="password" autoComplete="new-password" required fullWidth />
  </DialogueFormulaire>;
}

export function MonCompte({ compte, droits, demandesPourMoi, demandesEnvoyees }: {
  compte: { nom: string; email: string; libelleRole: string; motDePasseProvisoire: boolean }; droits: Droit[];
  demandesPourMoi: number; demandesEnvoyees: number;
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const initiales = compte.nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("");
  return <Stack spacing={2.5} sx={{ maxWidth: 760 }}>
    <EnTete titre="Mon compte" />
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Avatar sx={{ width: 64, height: 64, fontSize: 24, fontWeight: 600, bgcolor: JETONS.encre }}>{initiales}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" component="p">{compte.nom}</Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{compte.email} · {compte.libelleRole}</Typography>
      </Box>
    </Box>
    {compte.motDePasseProvisoire && <Alert severity="warning" icon={false}
      action={<Button color="inherit" size="small" onClick={() => setDialogue(true)}>Choisir</Button>}>
      Votre mot de passe est provisoire : le super-administrateur le connaît. Choisissez le vôtre.
    </Alert>}
    <Bloc titre="Mes demandes" icone={IconSend} teinte="violet" lien="/pilot/demandes" action="Ouvrir mes demandes">
      <Ligne nom="Ce qu'on me demande" detail="Demandes de mes collègues, encore à faire.">{demandesPourMoi}</Ligne>
      <Ligne nom="Ce que j'ai demandé" detail="En attente d'une réponse.">{demandesEnvoyees}</Ligne>
    </Bloc>
    <Bloc titre="Ce que permet mon rôle" nombre={compte.libelleRole} icone={IconShieldCheck} teinte="vert">
      {droits.map((d) => <Ligne key={d.texte} nom={<Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1, color: d.ouvert ? "text.primary" : "text.secondary" }}>
        {d.ouvert ? <IconCheck size={18} color={TEINTES.vert} aria-label="Ouvert" /> : <IconX size={18} aria-label="Fermé" />}{d.texte}
      </Box>} detail={d.detail} />)}
    </Bloc>
    <Bloc id="mot-de-passe" titre="Mot de passe" icone={IconKey} teinte="gris">
      <Ligne nom={compte.motDePasseProvisoire ? "Provisoire, donné par le super-administrateur." : "Choisi par vous."}
        detail="En cas d'oubli, le super-administrateur vous en donne un nouveau, provisoire.">
        <Button variant="outlined" onClick={() => setDialogue(true)}>Changer</Button>
      </Ligne>
    </Bloc>
    <Box><Button variant="outlined" color="error" onClick={() => void signOut({ callbackUrl: "/connexion" })}>Se déconnecter</Button></Box>
    {dialogue && <DialogueMotDePasse fermer={() => setDialogue(false)} fini={() => { setDialogue(false); setMessage("Mot de passe enregistré."); router.refresh(); }} />}
    <Snackbar open={message !== null} autoHideDuration={4000} onClose={() => setMessage(null)} message={message} />
  </Stack>;
}
