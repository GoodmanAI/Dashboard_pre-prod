"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, MenuItem, TextField } from "@mui/material";
import type { CrmDepartement } from "@prisma/client";
import { DEPARTEMENTS, LIBELLES_DEPARTEMENT, LIBELLE_SANS_DEPARTEMENT } from "@/pilot/lib/acces/departements";
import { modificationDepartement } from "@/pilot/lib/validation/commentaire";
import { envoyer } from "./DialogueFormulaire";

/**
 * Le département d'un compte, choisi par le super-administrateur dans l'écran
 * Équipe (lot T). Le choix s'enregistre tout de suite : le serveur répond par
 * le département écrit et sa nouvelle version, ou refuse avec une phrase, que
 * l'écran affiche sous la liste en rendant le choix précédent. `majLe` est la
 * version lue (C-26) ; un second écran qui a changé entre-temps reçoit « Rechargez la page ».
 */
export function SelecteurDepartement({ compteId, nom, departement, majLe, signaler }: {
  compteId: number; nom: string; departement: CrmDepartement | null; majLe: string | null; signaler: (texte: string) => void;
}) {
  const router = useRouter();
  // Le dernier état connu du serveur : ce qu'on rend si l'enregistrement est refusé.
  const [enregistre, setEnregistre] = useState({ departement, majLe });
  const [choix, setChoix] = useState<CrmDepartement | "">(departement ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(false);
  // Une relecture de la page (autre action, autre onglet) apporte la version du serveur : elle prime.
  const [propsVues, setPropsVues] = useState({ departement, majLe });
  if (propsVues.departement !== departement || propsVues.majLe !== majLe) {
    setPropsVues({ departement, majLe }); setEnregistre({ departement, majLe }); setChoix(departement ?? "");
  }

  async function changer(valeur: CrmDepartement) {
    if (verrou.current || valeur === enregistre.departement) return;
    verrou.current = true; setEnvoi(true); setErreur(null); setChoix(valeur);
    try {
      const ecrit = await envoyer<{ departement: CrmDepartement; majLe: string }>(`/api/pilot/equipe/${compteId}/departement`, "PATCH", modificationDepartement,
        { departement: valeur, majLe: enregistre.majLe });
      setEnregistre({ departement: ecrit.departement, majLe: ecrit.majLe });
      setChoix(ecrit.departement);
      signaler(`Département de ${nom} enregistré : ${LIBELLES_DEPARTEMENT[ecrit.departement]}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Le département n'a pas été enregistré. Réessayez.";
      setChoix(enregistre.departement ?? "");
      setErreur(message);
      // Une version périmée : la page se relit pour montrer ce que l'autre écran a enregistré.
      if (/rechargez/i.test(message)) router.refresh();
    } finally { verrou.current = false; setEnvoi(false); }
  }

  return <TextField select size="small" label="Département" value={choix} disabled={envoi} error={erreur !== null}
    onChange={(e) => void changer(e.target.value as CrmDepartement)}
    InputLabelProps={{ shrink: true }}
    SelectProps={{ displayEmpty: true, renderValue: (v) => v ? LIBELLES_DEPARTEMENT[v as CrmDepartement]
      : <Box component="span" sx={{ color: "text.secondary" }}>{LIBELLE_SANS_DEPARTEMENT}</Box> }}
    helperText={erreur ?? (choix === "" ? "Sans département, la personne ne reçoit pas les alertes adressées à un département." : undefined)}
    FormHelperTextProps={{ role: erreur ? "alert" : undefined }}
    sx={{ minWidth: { xs: "100%", sm: 220 }, maxWidth: "100%" }}>
    {DEPARTEMENTS.map((d) => <MenuItem key={d} value={d}>{LIBELLES_DEPARTEMENT[d]}</MenuItem>)}
  </TextField>;
}
