"use client";

import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, IconButton, Tooltip } from "@mui/material";
import { keyframes } from "@mui/system";
import { IconMicrophone, IconPlayerStopFilled } from "@tabler/icons-react";
import { INK_MUTED } from "@/lib/jetons";

/**
 * Le micro de la recherche centrale (plan workspace `plans/2026-10-recherche-llm-et-voix.md`, § 2).
 *
 * Un appui démarre l'écoute, un second l'arrête. Elle s'arrête aussi seule : après un
 * silence d'environ 1,5 s une fois la voix entendue, et au plus tard à 20 s. L'extrait part
 * à `/api/recherche/voix` (Deepgram, relayé par le serveur), le texte revient par `onTexte`,
 * et la barre le montre avant de chercher : la secrétaire voit ce qui a été compris.
 *
 * Le bouton ne s'affiche pas quand la dictée n'est pas activée côté serveur
 * (`DEEPGRAM_API_KEY` absente) ni quand le navigateur ne sait pas enregistrer.
 */

const DUREE_MAX_MS = 20_000;
const SILENCE_MS = 1_500;
// Niveau (RMS de 0 à 1) au-dessus duquel on considère que quelqu'un parle. Un bureau calme
// est autour de 0,005, une voix à 30 cm au-dessus de 0,03.
const SEUIL_VOIX = 0.02;

type Etat = "repos" | "ecoute" | "transcription";

let disponibilite: Promise<boolean> | null = null;
function dicteeDisponible(): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    return Promise.resolve(false);
  }
  disponibilite ??= fetch("/api/recherche/voix")
    .then((r) => (r.ok ? r.json() : { disponible: false }))
    .then((d) => Boolean(d?.disponible))
    .catch(() => false);
  return disponibilite;
}

function formatAudio(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) =>
    MediaRecorder.isTypeSupported(t)
  );
}

const pulsation = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.45); }
  100% { box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0); }
`;

export default function BoutonDictee({
  onTexte,
  onErreur,
  taille = 22,
}: {
  onTexte: (texte: string) => void;
  onErreur: (message: string) => void;
  taille?: number;
}) {
  const [disponible, setDisponible] = useState(false);
  const [etat, setEtat] = useState<Etat>("repos");
  const arreter = useRef<() => void>(() => {});

  useEffect(() => {
    let actif = true;
    void dicteeDisponible().then((d) => actif && setDisponible(d));
    return () => {
      actif = false;
      arreter.current();
    };
  }, []);

  if (!disponible) return null;

  async function ecouter() {
    let flux: MediaStream;
    try {
      flux = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      onErreur("Le micro est bloqué. Autorisez-le dans la barre d'adresse du navigateur, ou tapez votre recherche.");
      return;
    }
    const type = formatAudio();
    const enregistreur = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
    const morceaux: Blob[] = [];
    enregistreur.ondataavailable = (e) => e.data.size && morceaux.push(e.data);

    // Fin sur silence : on mesure le niveau du micro, et on coupe 1,5 s après la dernière
    // parole entendue. Avec du bruit de fond, l'appui ou les 20 s font le reste.
    const audio = new AudioContext();
    const analyse = audio.createAnalyser();
    analyse.fftSize = 1024;
    audio.createMediaStreamSource(flux).connect(analyse);
    const echantillons = new Float32Array(analyse.fftSize);
    let parle = false;
    let derniereVoix = Date.now();
    const debut = Date.now();
    const veille = window.setInterval(() => {
      analyse.getFloatTimeDomainData(echantillons);
      const rms = Math.sqrt(echantillons.reduce((s, v) => s + v * v, 0) / echantillons.length);
      if (rms > SEUIL_VOIX) {
        parle = true;
        derniereVoix = Date.now();
      }
      const maintenant = Date.now();
      if ((parle && maintenant - derniereVoix > SILENCE_MS) || maintenant - debut > DUREE_MAX_MS) fin();
    }, 100);

    let fini = false;
    function fin() {
      if (fini) return;
      fini = true;
      window.clearInterval(veille);
      if (enregistreur.state !== "inactive") enregistreur.stop();
      flux.getTracks().forEach((t) => t.stop());
      void audio.close();
    }
    arreter.current = fin;

    enregistreur.onstop = async () => {
      arreter.current = () => {};
      if (!parle) {
        setEtat("repos");
        onErreur("Je n'ai rien entendu. Parlez après avoir appuyé sur le micro.");
        return;
      }
      setEtat("transcription");
      try {
        const corps = new Blob(morceaux, { type: enregistreur.mimeType || "audio/webm" });
        const r = await fetch("/api/recherche/voix", {
          method: "POST",
          headers: { "Content-Type": corps.type },
          body: corps,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "La dictée ne répond pas pour le moment. Tapez votre recherche.");
        if (!d.texte) throw new Error("Je n'ai pas compris. Réessayez, ou tapez votre recherche.");
        onTexte(d.texte);
      } catch (e) {
        onErreur((e as Error).message);
      } finally {
        setEtat("repos");
      }
    };

    enregistreur.start();
    setEtat("ecoute");
  }

  if (etat === "transcription") {
    return (
      <Box sx={{ width: taille + 16, display: "flex", justifyContent: "center", flexShrink: 0 }}>
        <CircularProgress size={taille - 2} sx={{ color: "var(--accent)" }} aria-label="Transcription en cours" />
      </Box>
    );
  }

  const ecoute = etat === "ecoute";
  return (
    <Tooltip title={ecoute ? "Je vous écoute. Appuyez pour arrêter." : "Dicter la recherche"}>
      <IconButton
        onClick={() => (ecoute ? arreter.current() : void ecouter())}
        aria-label={ecoute ? "Arrêter la dictée" : "Dicter la recherche"}
        aria-pressed={ecoute}
        sx={{
          flexShrink: 0,
          color: ecoute ? "#fff" : INK_MUTED,
          bgcolor: ecoute ? "var(--accent)" : "transparent",
          animation: ecoute ? `${pulsation} 1.2s ease-out infinite` : "none",
          transition: "background-color .15s, color .15s",
          "&:hover": { bgcolor: ecoute ? "var(--accent-press)" : "rgba(var(--accent-rgb), 0.1)" },
        }}
      >
        {ecoute ? <IconPlayerStopFilled size={taille - 4} /> : <IconMicrophone size={taille} />}
      </IconButton>
    </Tooltip>
  );
}
