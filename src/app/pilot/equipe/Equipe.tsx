"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Menu, MenuItem,
  Radio, RadioGroup, Snackbar, Stack, TextField, Typography,
} from "@mui/material";
import { IconBell, IconCode, IconCrown, IconDots, IconUserOff, IconUserShield } from "@tabler/icons-react";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { SelecteurDepartement } from "@/pilot/components/formulaires/SelecteurDepartement";
import { SelecteurDirecteur } from "@/pilot/components/formulaires/SelecteurDirecteur";
import { DROITS, ORDRE_PROFILS, PROFILS, raisonDroitImpossible, type Droit, type Profil } from "@/pilot/lib/acces/droits";
import type { MembreEquipe } from "@/pilot/lib/acces/comptes";
import { DEPARTEMENTS, LIBELLES_DEPARTEMENT, LIBELLE_SANS_DEPARTEMENT } from "@/pilot/lib/acces/departements";
import type { CrmDepartement } from "@prisma/client";
import { creationCompte, operationAcces } from "@/pilot/lib/validation/acces";
import { JETONS } from "@/pilot/jetons";
import { ChampsAccesDashboard, resumeAccesDashboard } from "@/pilot/components/formulaires/AccesDashboard";
import { PREREGLAGES, type AccesInternes } from "@/lib/accesInternes";

type Dialogue =
  | { type: "creer" }
  | { type: "droits"; membre: MembreEquipe }
  | { type: "dashboard"; membre: MembreEquipe }
  | { type: "motDePasse"; membre: MembreEquipe }
  | { type: "retirer"; membre: MembreEquipe }
  | { type: "provisoire"; nom: string; motDePasse: string; nouveau: boolean };

/** Les droits d'un compte en une ligne : ce qu'il a en plus du suivi des clients. */
function resume(m: MembreEquipe): string {
  if (m.superAdmin) return "Tous les droits, toujours. Crée les comptes et donne les droits.";
  const noms = DROITS.filter((d) => m.droits.includes(d.cle)).map((d) => d.court);
  return noms.length ? noms.join(" · ") : "Suit les clients et les déploiements, sans droit en plus.";
}

/** Le rôle, puis les droits cochés un à un. Un droit impossible est grisé et dit pourquoi. */
function ChampsDroits({ profil, droits, changer }: { profil: Profil; droits: Droit[]; changer: (profil: Profil, droits: Droit[]) => void }) {
  const basculer = (cle: Droit, coche: boolean) => {
    const suivants = coche ? [...droits, cle] : droits.filter((d) => d !== cle);
    // Sans la vue, l'export n'a plus de sens : il se décoche avec elle.
    changer(profil, cle === "VOIR_CA" && !coche ? suivants.filter((d) => d !== "EXPORTER_CA") : suivants);
  };
  return <>
    <Box>
      <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>Rôle</Typography>
      <RadioGroup value={profil} onChange={(e) => { const p = e.target.value as Profil; changer(p, [...PROFILS[p].parDefaut]); }}>
        {ORDRE_PROFILS.map((p) => <FormControlLabel key={p} value={p} control={<Radio />} sx={{ alignItems: "flex-start", mb: 0.5, "& .MuiRadio-root": { mt: -0.75 } }}
          label={<Box><Box component="span" sx={{ fontWeight: 500 }}>{PROFILS[p].libelle}</Box>
            <Typography variant="body2" color="text.secondary">{PROFILS[p].detail}</Typography></Box>} />)}
      </RadioGroup>
    </Box>
    <Box>
      <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>Droits</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Changer de rôle remet les droits par défaut de ce rôle. Vous pouvez ensuite cocher ou décocher.
      </Typography>
      {DROITS.map((d) => {
        const impossible = raisonDroitImpossible(profil, d.cle, droits);
        // L'export reste cochable une fois la vue cochée : sa raison ne vaut que tant que la vue manque.
        const bloque = impossible !== null && !droits.includes(d.cle);
        return <FormControlLabel key={d.cle} disabled={bloque} sx={{ alignItems: "flex-start", display: "flex", mb: 0.75, "& .MuiCheckbox-root": { mt: -0.75 } }}
          control={<Checkbox name={d.cle} checked={droits.includes(d.cle)} onChange={(e) => basculer(d.cle, e.target.checked)} />}
          label={<Box><Box component="span" sx={{ fontWeight: 500 }}>{d.libelle}</Box>
            <Typography variant="body2" color="text.secondary">{bloque ? impossible : d.detail}</Typography></Box>} />;
      })}
    </Box>
  </>;
}

/** Le mot de passe provisoire, montré une seule fois : à recopier ou copier, puis à transmettre. */
function MotDePasseProvisoire({ nom, motDePasse, nouveau, fermer }: { nom: string; motDePasse: string; nouveau: boolean; fermer: () => void }) {
  const [copie, setCopie] = useState<string | null>(null);
  return <Dialog open onClose={fermer} fullWidth maxWidth="sm" aria-labelledby="titre-provisoire">
    <DialogTitle id="titre-provisoire">{nouveau ? "Compte créé" : "Nouveau mot de passe"}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Donnez ce mot de passe provisoire à {nom}. Il ne sera plus affiché.</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, p: 2, borderRadius: "12px", bgcolor: JETONS.gris }}>
          <Typography component="output" aria-label="Mot de passe provisoire" sx={{ flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 20, fontWeight: 600, letterSpacing: "0.04em" }}>
            {motDePasse}
          </Typography>
          <Button variant="outlined" onClick={async () => {
            try { await navigator.clipboard.writeText(motDePasse); setCopie("Mot de passe copié."); }
            catch { setCopie("La copie a échoué. Recopiez-le à la main."); }
          }}>Copier</Button>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {nom} se connecte avec son adresse e-mail et ce mot de passe, puis en choisit un dans Mon compte. Pilot le lui rappelle tant qu&apos;il est provisoire.
        </Typography>
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 3 }}><Button variant="contained" onClick={fermer}>Terminé</Button></DialogActions>
    <Snackbar open={copie !== null} autoHideDuration={3000} onClose={() => setCopie(null)} message={copie} />
  </Dialog>;
}

function DialogueCreer({ fermer, cree }: { fermer: () => void; cree: (nom: string, motDePasse: string) => void }) {
  const [choix, setChoix] = useState<{ profil: Profil; droits: Droit[] }>({ profil: "DEVELOPPEUR", droits: [...PROFILS.DEVELOPPEUR.parDefaut] });
  // Facultatif (lot T) : sans choix, « Département pas encore choisi », à compléter plus tard depuis la liste.
  const [departement, setDepartement] = useState<CrmDepartement | "">("");
  // Les écrans du Dashboard, par préréglage ici ; on les affine ensuite avec « Accès au Dashboard ».
  const [prereglage, setPrereglage] = useState(PREREGLAGES[0].cle);
  return <DialogueFormulaire titre="Nouveau compte" bouton="Créer le compte" fermer={fermer} soumettre={async (f) => {
    const nom = String(f.get("nom") ?? "").trim();
    const { motDePasse } = await envoyer<{ motDePasse: string }>("/api/pilot/equipe", "POST", creationCompte,
      { nom, email: String(f.get("email") ?? ""), ...choix, ...(departement ? { departement } : {}),
        dashboard: (PREREGLAGES.find((p) => p.cle === prereglage) ?? PREREGLAGES[0]).acces() });
    cree(nom, motDePasse);
  }}>
    <TextField name="nom" label="Nom" required fullWidth autoFocus autoComplete="off" helperText="Prénom et nom, tels que l'équipe les connaît." />
    <TextField name="email" label="Adresse e-mail" type="email" required fullWidth autoComplete="off" helperText="Elle sert à se connecter." />
    <TextField select label="Département" value={departement} fullWidth onChange={(e) => setDepartement(e.target.value as CrmDepartement | "")}
      InputLabelProps={{ shrink: true }}
      SelectProps={{ displayEmpty: true, renderValue: (v) => v ? LIBELLES_DEPARTEMENT[v as CrmDepartement]
        : <Box component="span" sx={{ color: "text.secondary" }}>{LIBELLE_SANS_DEPARTEMENT}</Box> }}
      helperText="Facultatif. Il sert aux alertes adressées à un département. Vous pourrez le choisir plus tard.">
      <MenuItem value="" sx={{ color: "text.secondary" }}>{LIBELLE_SANS_DEPARTEMENT}</MenuItem>
      {DEPARTEMENTS.map((d) => <MenuItem key={d} value={d}>{LIBELLES_DEPARTEMENT[d]}</MenuItem>)}
    </TextField>
    <ChampsDroits profil={choix.profil} droits={choix.droits} changer={(profil, droits) => setChoix({ profil, droits })} />
    <Box>
      <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>Accès au Dashboard</Typography>
      <RadioGroup value={prereglage} onChange={(e) => setPrereglage(e.target.value)}>
        {PREREGLAGES.map((p) => <FormControlLabel key={p.cle} value={p.cle} control={<Radio />} sx={{ alignItems: "flex-start", mb: 0.5, "& .MuiRadio-root": { mt: -0.75 } }}
          label={<Box><Box component="span" sx={{ fontWeight: 500 }}>{p.libelle}</Box>
            <Typography variant="body2" color="text.secondary">{p.detail}</Typography></Box>} />)}
      </RadioGroup>
      <Typography variant="body2" color="text.secondary">Vous choisirez ensuite écran par écran avec « Accès au Dashboard ».</Typography>
    </Box>
  </DialogueFormulaire>;
}

function DialogueAccesDashboard({ membre, fermer, fini }: { membre: MembreEquipe; fermer: () => void; fini: () => void }) {
  const avant: AccesInternes = membre.accesDashboard ?? {};
  const [acces, setAcces] = useState<AccesInternes>(avant);
  return <DialogueFormulaire titre={`Accès au Dashboard de ${membre.nom}`} fermer={fermer} soumettre={async () => {
    await envoyer(`/api/pilot/equipe/${membre.id}`, "PATCH", operationAcces, { operation: "dashboard", acces, avant });
    fini();
  }}>
    <Alert severity="info" icon={false}>
      {membre.nom} sera déconnecté à l&apos;enregistrement, et se reconnectera avec ces accès.
    </Alert>
    <ChampsAccesDashboard acces={acces} changer={setAcces} />
  </DialogueFormulaire>;
}

function DialogueDroits({ membre, fermer, fini }: { membre: MembreEquipe; fermer: () => void; fini: () => void }) {
  const [choix, setChoix] = useState<{ profil: Profil; droits: Droit[] }>({ profil: membre.profil ?? "DEVELOPPEUR", droits: membre.droits });
  return <DialogueFormulaire titre={`Droits de ${membre.nom}`} fermer={fermer} soumettre={async () => {
    await envoyer(`/api/pilot/equipe/${membre.id}`, "PATCH", operationAcces, { operation: "droits", ...choix, majLe: membre.majLe });
    fini();
  }}>
    {!membre.profilConfirme && <Alert severity="info" icon={false}>
      Aucun rôle n&apos;a encore été choisi pour ce compte : il est traité en développeur. Enregistrez pour confirmer ou changer.
    </Alert>}
    <ChampsDroits profil={choix.profil} droits={choix.droits} changer={(profil, droits) => setChoix({ profil, droits })} />
  </DialogueFormulaire>;
}

/** Les actions sur une ligne : les droits en bouton, le reste derrière « plus ». */
function Actions({ membre, ouvrir, rendre }: { membre: MembreEquipe; ouvrir: (d: Dialogue) => void; rendre: (m: MembreEquipe) => void }) {
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  if (membre.superAdmin) return null;
  if (membre.retireLe) return <Button variant="outlined" onClick={() => rendre(membre)}>Rendre l&apos;accès</Button>;
  return <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
    <Button variant="outlined" onClick={() => ouvrir({ type: "droits", membre })}>Droits dans Pilot</Button>
    <Button variant="outlined" onClick={() => ouvrir({ type: "dashboard", membre })}>Accès au Dashboard</Button>
    <IconButton aria-label={`Plus d'actions pour ${membre.nom}`} aria-haspopup="menu" onClick={(e) => setAncre(e.currentTarget)}><IconDots size={20} /></IconButton>
    <Menu anchorEl={ancre} open={Boolean(ancre)} onClose={() => setAncre(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
      <MenuItem onClick={() => { setAncre(null); ouvrir({ type: "motDePasse", membre }); }}>Donner un nouveau mot de passe</MenuItem>
      <MenuItem onClick={() => { setAncre(null); ouvrir({ type: "retirer", membre }); }} sx={{ color: "error.main" }}>Retirer l&apos;accès</MenuItem>
    </Menu>
  </Box>;
}

function LigneMembre({ membre, ouvrir, rendre, signaler }: { membre: MembreEquipe; ouvrir: (d: Dialogue) => void; rendre: (m: MembreEquipe) => void; signaler: (texte: string) => void }) {
  const notes = [
    membre.retireLe && `Accès retiré le ${new Date(membre.retireLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`,
    !membre.retireLe && membre.motDePasseProvisoire && "Mot de passe provisoire, pas encore changé.",
    !membre.retireLe && !membre.profilConfirme && "Rôle pas encore choisi : traité en développeur.",
  ].filter(Boolean);
  return <Ligne data-compte={membre.id} nom={membre.nom} detail={<>
    <Box sx={{ overflowWrap: "anywhere" }}>{membre.email}</Box>
    {!membre.retireLe && <Box sx={{ color: "text.primary" }}>{resume(membre)}</Box>}
    {!membre.retireLe && <Box sx={{ color: "text.primary" }}>{resumeAccesDashboard(membre.accesDashboard)}</Box>}
    {notes.map((n) => <Box key={String(n)} sx={{ color: membre.retireLe ? "text.secondary" : "warning.dark" }}>{n}</Box>)}
  </>}>
    <SelecteurDepartement compteId={membre.id} nom={membre.nom} departement={membre.departement} majLe={membre.departementMajLe} signaler={signaler} />
    <Actions membre={membre} ouvrir={ouvrir} rendre={rendre} />
  </Ligne>;
}

export function Equipe({ membres, directeur }: { membres: MembreEquipe[]; directeur: { userId: number; majLe: string } | null }) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const termine = (texte: string) => { setDialogue(null); setMessage(texte); router.refresh(); };
  async function rendre(m: MembreEquipe) {
    setErreur(null);
    try { await envoyer(`/api/pilot/equipe/${m.id}`, "PATCH", operationAcces, { operation: "rendre" }); setMessage(`${m.nom} a de nouveau accès à Pilot.`); router.refresh(); }
    catch (e) { setErreur(e instanceof Error ? e.message : "Le retour de l'accès a échoué."); }
  }
  const actifs = membres.filter((m) => !m.retireLe);
  const groupes = [
    { titre: "Super-administrateurs", icone: IconCrown, teinte: "orange" as const, liste: actifs.filter((m) => m.superAdmin) },
    { titre: "Gérants", icone: IconUserShield, teinte: "bleu" as const, liste: actifs.filter((m) => m.profil === "GERANT") },
    { titre: "Développeurs", icone: IconCode, teinte: "violet" as const, liste: actifs.filter((m) => m.profil === "DEVELOPPEUR") },
  ];
  const retires = membres.filter((m) => m.retireLe);
  const vides: Record<string, string> = {
    "Gérants": "Aucun gérant. Un gérant voit et pilote tout, chiffre d'affaires compris.",
    "Développeurs": "Aucun développeur. Un développeur suit les clients et les déploiements, sans le chiffre d'affaires.",
  };

  return <Stack spacing={2.5}>
    <EnTete titre="Équipe" sousTitre="Les comptes de l'équipe Lyrae. Vous les créez, choisissez ce que chacun peut faire et son département.">
      <Button variant="contained" onClick={() => setDialogue({ type: "creer" })}>Nouveau compte</Button>
    </EnTete>
    {erreur && <Alert severity="error" icon={false} onClose={() => setErreur(null)}>{erreur}</Alert>}
    <Bloc titre="Qui reçoit les alertes" icone={IconBell} teinte="rouge">
      <SelecteurDirecteur membres={actifs.map((m) => ({ id: m.id, nom: m.nom }))} directeur={directeur} signaler={setMessage} />
    </Bloc>
    {groupes.map((g) => <Bloc key={g.titre} titre={g.titre} nombre={g.liste.length} icone={g.icone} teinte={g.teinte} vide={g.liste.length ? undefined : vides[g.titre]}>
      {g.liste.map((m) => <LigneMembre key={m.id} membre={m} ouvrir={setDialogue} rendre={(x) => void rendre(x)} signaler={setMessage} />)}
    </Bloc>)}
    {retires.length > 0 && <Bloc titre="Accès retirés" nombre={retires.length} icone={IconUserOff} teinte="gris">
      {retires.map((m) => <LigneMembre key={m.id} membre={m} ouvrir={setDialogue} rendre={(x) => void rendre(x)} signaler={setMessage} />)}
    </Bloc>}

    {dialogue?.type === "creer" && <DialogueCreer fermer={() => setDialogue(null)}
      cree={(nom, motDePasse) => { setDialogue({ type: "provisoire", nom, motDePasse, nouveau: true }); router.refresh(); }} />}
    {dialogue?.type === "droits" && <DialogueDroits membre={dialogue.membre} fermer={() => setDialogue(null)}
      fini={() => termine(`Droits de ${dialogue.membre.nom} enregistrés.`)} />}
    {dialogue?.type === "dashboard" && <DialogueAccesDashboard membre={dialogue.membre} fermer={() => setDialogue(null)}
      fini={() => termine(`Accès au Dashboard de ${dialogue.membre.nom} enregistrés.`)} />}
    {dialogue?.type === "motDePasse" && <DialogueFormulaire titre={`Nouveau mot de passe pour ${dialogue.membre.nom} ?`} bouton="Donner un nouveau mot de passe"
      fermer={() => setDialogue(null)} soumettre={async () => {
        const { motDePasse } = await envoyer<{ motDePasse: string }>(`/api/pilot/equipe/${dialogue.membre.id}`, "PATCH", operationAcces, { operation: "motDePasse" });
        setDialogue({ type: "provisoire", nom: dialogue.membre.nom, motDePasse, nouveau: false }); router.refresh();
      }}>
      <Typography>Son mot de passe actuel cessera de marcher. Vous lui transmettrez le nouveau, provisoire.</Typography>
    </DialogueFormulaire>}
    {dialogue?.type === "retirer" && <DialogueFormulaire titre={`Retirer l'accès de ${dialogue.membre.nom} ?`} bouton="Retirer l'accès" suppression
      fermer={() => setDialogue(null)} soumettre={async () => {
        await envoyer(`/api/pilot/equipe/${dialogue.membre.id}`, "PATCH", operationAcces, { operation: "retirer" });
        termine(`Accès de ${dialogue.membre.nom} retiré.`);
      }}>
      <Typography>{dialogue.membre.nom} ne pourra plus se connecter, ni à Pilot ni au Dashboard, et une session ouverte s&apos;arrête tout de suite.</Typography>
      <Typography color="text.secondary">Ses clients, ses demandes et son historique restent. Vous pourrez lui rendre l&apos;accès.</Typography>
    </DialogueFormulaire>}
    {dialogue?.type === "provisoire" && <MotDePasseProvisoire nom={dialogue.nom} motDePasse={dialogue.motDePasse} nouveau={dialogue.nouveau}
      fermer={() => setDialogue(null)} />}
    <Snackbar open={message !== null} autoHideDuration={4000} onClose={() => setMessage(null)} message={message} />
  </Stack>;
}
