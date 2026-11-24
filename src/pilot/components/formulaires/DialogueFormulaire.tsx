"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import type { z } from "zod";
import { messageValidation } from "@/pilot/lib/validation/messages";

export async function envoyer<T>(url: string, methode: string, schema?: z.ZodTypeAny, donnees?: unknown): Promise<T> {
  const analyse = schema?.safeParse(donnees);
  if (analyse && !analyse.success) throw new Error(messageValidation(analyse.error));
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: methode, headers: { "Content-Type": "application/json" },
      body: donnees === undefined ? undefined : JSON.stringify(analyse?.success ? analyse.data : donnees),
    });
  } catch { throw new Error("Le serveur est injoignable. Réessayez."); }
  // Une erreur serveur inattendue peut renvoyer une page HTML ou un corps vide.
  const resultat = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(resultat.erreur ?? "L'enregistrement a échoué. Réessayez dans un instant.");
  return resultat as T;
}

export function useFormulaire(soumettre: (donnees: FormData) => Promise<void>) {
  const verrou = useRef(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (verrou.current) return;
    const donnees = new FormData(e.currentTarget);
    verrou.current = true;
    setEnvoi(true);
    setErreur(null);
    try { await soumettre(donnees); }
    catch (e) { setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué."); }
    finally { verrou.current = false; setEnvoi(false); }
  }
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  }
  return { envoi, erreur, onSubmit, onKeyDown };
}

export function DialogueFormulaire({ titre, fermer, soumettre, children, bouton = "Enregistrer", suppression = false, maxWidth = "sm" }: {
  titre: string; fermer: () => void; soumettre: (donnees: FormData) => Promise<void>;
  children: ReactNode; bouton?: string; suppression?: boolean; maxWidth?: "sm" | "md";
}) {
  const formulaire = useFormulaire(soumettre);
  const titreId = useId();
  return (
    <Dialog open onClose={fermer} fullWidth maxWidth={maxWidth} aria-labelledby={titreId}>
      <form onSubmit={formulaire.onSubmit} onKeyDown={formulaire.onKeyDown}>
        <DialogTitle id={titreId}>{titre}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formulaire.erreur && <Alert severity="error" icon={false}>{formulaire.erreur}</Alert>}
            {children}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={fermer} autoFocus={suppression}>Annuler</Button>
          <Button type="submit" variant="contained" color={suppression ? "error" : "primary"} disabled={formulaire.envoi}>{bouton}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
