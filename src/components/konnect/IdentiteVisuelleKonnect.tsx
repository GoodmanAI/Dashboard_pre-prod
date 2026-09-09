"use client";

import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";

/**
 * Les couleurs et le logo du portail patient, avec l'aperçu de ce que ça donne.
 *
 * POURQUOI UN APERÇU, ET PAS DEUX PASTILLES. Un client qui choisit deux couleurs dans
 * des carrés ne sait pas ce qu'il obtient : il découvre le résultat après avoir
 * enregistré, en ouvrant le portail. Il change alors une couleur, réenregistre,
 * rouvre. La maquette ci-dessous montre le même écran que le patient, repeint en
 * direct, ce qui ramène la boucle à zéro aller-retour.
 *
 * LA MAQUETTE EST VOLONTAIREMENT APPROXIMATIVE. Elle reprend la structure du premier
 * écran de Konnect (bandeau, titre, carte, bouton principal, bouton secondaire), pas
 * son pixel exact. Prétendre à l'exactitude obligerait à la maintenir en parallèle du
 * vrai parcours, et une maquette qui ment est pire que pas de maquette : elle promet
 * ce qui n'arrivera pas.
 *
 * CE QU'ELLE MONTRE FIDÈLEMENT, EN REVANCHE, c'est le RAPPORT entre les deux couleurs
 * et la lisibilité du texte posé dessus. C'est ce qu'on vient vérifier ici.
 */

/** Palette livrée de Konnect. Une couleur laissée vide retombe dessus. */
const LYRAE_PRINCIPALE = "#1268c4";
const LYRAE_SECONDAIRE = "#10396b";

const COULEUR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function estCouleur(valeur: string | null): boolean {
  return typeof valeur === "string" && COULEUR_RE.test(valeur.trim());
}

/** `#abc` → `#aabbcc`. Une seule forme circule ensuite. */
function developper(hex: string): string {
  const c = hex.trim().toLowerCase();
  if (c.length === 4) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return c;
}

function versRgb(hex: string): [number, number, number] {
  const c = developper(hex);
  return [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
}

/** Luminance relative WCAG. Sert au ratio de contraste, rien d'autre. */
function luminance(hex: string): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, v, b] = versRgb(hex);
  return 0.2126 * canal(r) + 0.7152 * canal(v) + 0.0722 * canal(b);
}

/** Ratio de contraste avec le blanc, arrondi au dixième. */
function contrasteAvecBlanc(hex: string): number {
  const l = luminance(hex);
  return Math.round(((1.05) / (l + 0.05)) * 10) / 10;
}

/**
 * Assombrit une couleur, comme le fera Konnect pour l'état pressé.
 *
 * La formule est la même des deux côtés (multiplication des canaux) : ce que le
 * client voit ici est ce que le patient verra. Deux formules différentes feraient de
 * l'aperçu un mensonge sur le détail le plus difficile à vérifier après coup.
 */
function assombrir(hex: string, facteur = 0.78): string {
  const [r, v, b] = versRgb(hex);
  const c = (x: number) => Math.max(0, Math.round(x * facteur));
  return `#${[c(r), c(v), c(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Éclaircit vers le blanc : le fond des zones d'information (`--accent-tint`). */
function eclaircir(hex: string, facteur = 0.9): string {
  const [r, v, b] = versRgb(hex);
  const c = (x: number) => Math.round(x + (255 - x) * facteur);
  return `#${[c(r), c(v), c(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

type LogoEtat = {
  present: boolean;
  type: string | null;
  nom: string | null;
};

/** Un sélecteur de couleur : la pastille native, le code en clair, et le contraste. */
function ChampCouleur({
  label,
  aide,
  valeur,
  defaut,
  onChange,
}: {
  label: string;
  aide: string;
  valeur: string | null;
  defaut: string;
  onChange: (v: string | null) => void;
}): React.JSX.Element {
  const effective = estCouleur(valeur) ? developper(valeur as string) : defaut;
  const ratio = contrasteAvecBlanc(effective);
  // 4,5:1 est le seuil AA pour du texte normal. Nos boutons portent du blanc sur
  // cette couleur, en 16 px : c'est bien ce seuil-là qui s'applique, pas le 3:1 des
  // grands caractères.
  const lisible = ratio >= 4.5;

  return (
    <Box>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          component="input"
          type="color"
          aria-label={label}
          value={effective}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          sx={{
            width: 52,
            height: 40,
            padding: 0,
            border: "1px solid #d0d5dd",
            borderRadius: 1,
            cursor: "pointer",
            background: "none",
          }}
        />
        <Box
          component="input"
          type="text"
          aria-label={`${label}, code hexadécimal`}
          value={valeur ?? ""}
          placeholder={defaut}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value.trim() === "" ? null : e.target.value)
          }
          sx={{
            width: 120,
            height: 40,
            px: 1.25,
            border: "1px solid #d0d5dd",
            borderRadius: 1,
            fontFamily: "monospace",
            fontSize: 14,
          }}
        />
        {valeur !== null && (
          <Button size="small" onClick={() => onChange(null)}>
            Couleur Lyrae
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        {aide}
      </Typography>
      {!lisible && (
        // On le dit, on ne bloque pas : c'est sa charte, pas la nôtre. Mais un texte
        // blanc sur un fond trop clair ne se lit pas, et personne ne s'en aperçoit
        // avant qu'un patient n'abandonne.
        <Typography variant="caption" color="warning.main" component="p" sx={{ mt: 0.5 }}>
          Le texte blanc se lit mal sur cette couleur (contraste {ratio.toFixed(1)}:1, il en
          faut 4,5). Prenez une teinte plus foncée.
        </Typography>
      )}
    </Box>
  );
}

/** La maquette repeinte. Structure du premier écran de Konnect, pas son pixel exact. */
function Apercu({
  principale,
  secondaire,
  logoUrl,
  nomCentre,
}: {
  principale: string;
  secondaire: string;
  logoUrl: string | null;
  nomCentre: string;
}): React.JSX.Element {
  const tint = eclaircir(principale);
  return (
    <Box
      aria-label="Aperçu du portail patient"
      sx={{
        border: "1px solid #e3e9f0",
        borderRadius: 2,
        overflow: "hidden",
        background: "#eef2f7",
        maxWidth: 360,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <Box
        sx={{
          background: secondaire,
          color: "#fff",
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
        }}
      >
        {logoUrl && (
          <Box
            component="img"
            src={logoUrl}
            alt=""
            sx={{ height: 26, maxWidth: 110, objectFit: "contain" }}
          />
        )}
        <Box sx={{ lineHeight: 1.2, minWidth: 0 }}>
          <Box sx={{ fontWeight: 700, fontSize: 15 }}>{nomCentre}</Box>
          <Box sx={{ fontSize: 11, opacity: 0.85 }}>Lyrae Konnect</Box>
        </Box>
      </Box>

      <Box sx={{ p: 2.25 }}>
        <Box sx={{ background: "#fff", borderRadius: 2, p: 2, boxShadow: "0 1px 3px #0000000f" }}>
          <Box sx={{ fontSize: 17, fontWeight: 600, mb: 0.75, color: "#15212e" }}>
            Prendre rendez-vous
          </Box>
          <Box sx={{ fontSize: 13, color: "#51626f", mb: 2 }}>
            Déposez votre ordonnance, on s&apos;occupe du reste.
          </Box>
          <Box
            sx={{
              background: principale,
              color: "#fff",
              borderRadius: 1.5,
              py: 1.25,
              textAlign: "center",
              fontWeight: 600,
              fontSize: 14,
              mb: 1,
            }}
          >
            Déposer mon ordonnance
          </Box>
          <Box
            sx={{
              border: `1px solid ${principale}`,
              color: principale,
              borderRadius: 1.5,
              py: 1.25,
              textAlign: "center",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Je n&apos;ai pas d&apos;ordonnance
          </Box>
          <Box
            sx={{
              mt: 2,
              background: tint,
              borderRadius: 1.5,
              p: 1.25,
              fontSize: 12,
              color: "#15212e",
            }}
          >
            Une question ? Appelez le secrétariat.
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function IdentiteVisuelleKonnect({
  userProductId,
  // Le nom réel du centre n'est pas nécessaire ici : la maquette montre un RAPPORT de
  // couleurs, pas un écran exact, et aller chercher le nom ajouterait un appel réseau
  // pour un mot qui ne change rien à ce qu'on vient vérifier.
  nomCentre = "Votre centre",
  couleurPrincipale,
  couleurSecondaire,
  onCouleurPrincipale,
  onCouleurSecondaire,
}: {
  // `null` tant que le centre n'est pas résolu : l'écran se monte avant. Les appels
  // réseau se taisent alors, plutôt que de partir sur un identifiant qui n'existe pas.
  userProductId: number | null;
  nomCentre?: string;
  couleurPrincipale: string | null;
  couleurSecondaire: string | null;
  onCouleurPrincipale: (v: string | null) => void;
  onCouleurSecondaire: (v: string | null) => void;
}): React.JSX.Element {
  const [logo, setLogo] = useState<LogoEtat>({ present: false, type: null, nom: null });
  const [apercuLogo, setApercuLogo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const champFichier = useRef<HTMLInputElement | null>(null);

  // L'URL d'objet est libérée au démontage ET à chaque remplacement : sans ça, chaque
  // dépôt successif laisse un blob en mémoire jusqu'au rechargement de la page.
  const poserApercu = (url: string | null) => {
    setApercuLogo((prec) => {
      if (prec) URL.revokeObjectURL(prec);
      return url;
    });
  };
  useEffect(() => {
    return () => {
      if (apercuLogo) URL.revokeObjectURL(apercuLogo);
    };
    // Volontairement au démontage seulement : `apercuLogo` en dépendance relancerait
    // le nettoyage à chaque changement et révoquerait l'URL encore affichée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!Number.isFinite(userProductId)) return;
    let annule = false;
    const run = async () => {
      try {
        const r = await fetch(`/api/konnect-logo?userProductId=${userProductId}`);
        if (annule) return;
        if (r.ok) {
          const blob = await r.blob();
          if (annule) return;
          setLogo({ present: true, type: blob.type || null, nom: null });
          poserApercu(URL.createObjectURL(blob));
        } else {
          setLogo({ present: false, type: null, nom: null });
        }
      } catch {
        // Silencieux : l'absence d'aperçu n'empêche pas de régler les couleurs.
      }
    };
    run();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const deposer = async (fichier: File) => {
    if (!Number.isFinite(userProductId)) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const corps = new FormData();
      corps.append("fichier", fichier);
      const r = await fetch(`/api/konnect-logo?userProductId=${userProductId}`, {
        method: "PUT",
        body: corps,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage(data.error || "Le dépôt a échoué.");
        return;
      }
      setLogo({ present: true, type: data.type ?? fichier.type, nom: data.nom ?? fichier.name });
      poserApercu(URL.createObjectURL(fichier));
      setMessage("Logo enregistré. Le portail l'affichera à la prochaine synchronisation.");
    } catch {
      setMessage("Le dépôt a échoué. Réessayez.");
    } finally {
      setEnvoi(false);
      if (champFichier.current) champFichier.current.value = "";
    }
  };

  const retirer = async () => {
    if (!Number.isFinite(userProductId)) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/konnect-logo?userProductId=${userProductId}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        setMessage("Le retrait a échoué.");
        return;
      }
      setLogo({ present: false, type: null, nom: null });
      poserApercu(null);
      setMessage("Logo retiré.");
    } catch {
      setMessage("Le retrait a échoué. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  const principale = estCouleur(couleurPrincipale)
    ? developper(couleurPrincipale as string)
    : LYRAE_PRINCIPALE;
  // Sans couleur secondaire choisie, le bandeau suit la principale assombrie plutôt
  // que de rester au bleu Lyrae : un bandeau bleu au-dessus de boutons verts aurait
  // l'air d'un bug, pas d'un choix.
  const secondaire = estCouleur(couleurSecondaire)
    ? developper(couleurSecondaire as string)
    : estCouleur(couleurPrincipale)
      ? assombrir(principale, 0.62)
      : LYRAE_SECONDAIRE;

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
      <Stack spacing={2.5} sx={{ flex: 1, minWidth: 0 }}>
        <ChampCouleur
          label="Couleur principale"
          aide="Les boutons, les liens et les étapes en cours. Laissez vide pour garder la couleur Lyrae."
          valeur={couleurPrincipale}
          defaut={LYRAE_PRINCIPALE}
          onChange={onCouleurPrincipale}
        />
        <ChampCouleur
          label="Couleur secondaire"
          aide="Le bandeau du haut, celui qui porte votre nom. Laissez vide : elle sera déduite de la principale."
          valeur={couleurSecondaire}
          defaut={secondaire}
          onChange={onCouleurSecondaire}
        />

        <Box>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
            Logo
          </Typography>
          <input
            ref={champFichier}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void deposer(f);
            }}
          />
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              disabled={envoi}
              onClick={() => champFichier.current?.click()}
            >
              {logo.present ? "Remplacer le logo" : "Déposer un logo"}
            </Button>
            {logo.present && (
              <Button size="small" color="error" disabled={envoi} onClick={() => void retirer()}>
                Retirer
              </Button>
            )}
            {envoi && <CircularProgress size={18} />}
          </Stack>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
            PNG, JPEG, WEBP ou SVG, 512 Ko maximum. Le fichier est stocké chez nous : votre
            logo reste affiché même si votre site change.
          </Typography>
          {logo.nom && (
            <Typography variant="caption" color="text.secondary" component="p">
              Fichier déposé : {logo.nom}
            </Typography>
          )}
          {message && (
            <Alert severity="info" sx={{ mt: 1 }}>
              {message}
            </Alert>
          )}
        </Box>
      </Stack>

      <Box>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Aperçu
        </Typography>
        <Apercu
          principale={principale}
          secondaire={secondaire}
          logoUrl={apercuLogo}
          nomCentre={nomCentre}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ mt: 1, maxWidth: 360 }}
        >
          Une idée du rendu, pas une copie exacte. Les couleurs et leur rapport, eux, sont
          bien ceux que verra le patient.
        </Typography>
      </Box>
    </Stack>
  );
}
