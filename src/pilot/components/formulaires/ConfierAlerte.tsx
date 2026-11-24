"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, MenuItem, TextField, Typography } from "@mui/material";
import type { Alerte } from "@/pilot/lib/alertes/types";
import { nouvelleAttribution } from "@/pilot/lib/validation/attribution";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";

type Personne = { id: number; nom: string; poste: string };

/**
 * Confier une alerte à une personne (C-91). Le bouton n'apparaît que pour le
 * directeur général et le super-administrateur ; le serveur le revérifie. La
 * liste de l'équipe se lit à l'ouverture, pas à chaque affichage de la page.
 */
export function ConfierAlerte({ alerte }: { alerte: Alerte }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [equipe, setEquipe] = useState<Personne[] | null>(null);
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [choix, setChoix] = useState<number | "">("");
  useEffect(() => {
    if (!ouvert || equipe) return;
    envoyer<{ equipe: Personne[] }>("/api/pilot/alertes/attribuer", "GET")
      .then((r) => setEquipe(r.equipe)).catch((e) => setErreurListe(e instanceof Error ? e.message : "La liste de l'équipe n'a pas pu être lue."));
  }, [ouvert, equipe]);
  return <>
    <Button onClick={() => { setChoix(alerte.attribution?.userId ?? ""); setOuvert(true); }}>Confier</Button>
    {ouvert && <DialogueFormulaire titre="Confier l'alerte" bouton="Confier" fermer={() => setOuvert(false)} soumettre={async () => {
      await envoyer("/api/pilot/alertes/attribuer", "POST", nouvelleAttribution,
        { organisationId: alerte.organisationId, cleAlerte: alerte.cle, userId: choix === "" ? undefined : choix });
      setOuvert(false); router.refresh();
    }}>
      <Typography>{alerte.titre} · {alerte.organisationNom}</Typography>
      {alerte.aussi?.length ? <Typography variant="body2" color="text.secondary">Les autres signaux de la même cause suivent avec elle.</Typography> : null}
      <TextField select required autoFocus label="Qui doit agir ?" value={choix} disabled={!equipe}
        onChange={(e) => setChoix(Number(e.target.value))}
        helperText={erreurListe ?? (equipe ? "La personne la voit dans ses alertes et sur sa page Aujourd'hui." : "Lecture de l'équipe…")}
        error={erreurListe !== null}>
        {(equipe ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nom} · {p.poste}</MenuItem>)}
      </TextField>
    </DialogueFormulaire>}
  </>;
}
