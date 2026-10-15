"use client";

import { ReactNode } from "react";
import { Box, Checkbox, Stack, Typography } from "@mui/material";

/**
 * Un arbre de questions à cocher (15/10/2026) : chaque nœud est une question que
 * le robot pose ou non, avec ses suites (« Oui : … », « Non : … »). Un nœud peut
 * porter des enfants, dessinés en retrait sous lui avec un trait, et un contenu
 * libre sous sa case (un choix à faire quand la question n'est pas posée).
 *
 * Un nœud `inactif` reste lisible mais grisé : la question ne peut pas être posée
 * dans ce parcours, et `raisonInactif` dit pourquoi.
 */

export type NoeudQuestion = {
  cle: string;
  titre: string;
  question: string;
  suites: { si: string; alors: string }[];
  coche: boolean;
  inactif?: boolean;
  raisonInactif?: string;
  /** Sous la case, quand la question est décochée. */
  siDecoche?: ReactNode;
  enfants?: NoeudQuestion[];
};

function Noeud({
  n,
  onBasculer,
  desactive,
  numero,
}: {
  n: NoeudQuestion;
  onBasculer: (cle: string, coche: boolean) => void;
  desactive: boolean;
  numero: string;
}) {
  const grise = n.inactif || !n.coche;
  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="flex-start"
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: "1px solid",
          borderColor:
            n.coche && !n.inactif ? "rgba(var(--accent-rgb), 0.35)" : "divider",
          bgcolor:
            n.coche && !n.inactif
              ? "rgba(var(--accent-rgb), 0.05)"
              : "transparent",
          transition: "background-color 150ms, border-color 150ms",
        }}
      >
        <Checkbox
          checked={n.coche && !n.inactif}
          disabled={desactive || n.inactif}
          onChange={(e) => onBasculer(n.cle, e.target.checked)}
          inputProps={{ "aria-label": `Poser la question : ${n.titre}` }}
          sx={{ mt: -0.75, ml: -0.75 }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ color: grise ? "text.secondary" : "text.primary" }}
          >
            {numero}. {n.titre}
            {!n.inactif && !n.coche && (
              <Typography component="span" variant="caption" sx={{ ml: 1 }}>
                (pas posée)
              </Typography>
            )}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontStyle: "italic", mt: 0.25 }}
          >
            {n.question}
          </Typography>
          {n.inactif ? (
            n.raisonInactif && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.75 }}
              >
                {n.raisonInactif}
              </Typography>
            )
          ) : n.coche ? (
            <Stack direction="row" flexWrap="wrap" sx={{ mt: 0.75, gap: 1 }}>
              {n.suites.map((s) => (
                <Typography
                  key={s.si}
                  variant="caption"
                  sx={{
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: "rgba(0,0,0,0.05)",
                  }}
                >
                  <b>{s.si}</b> : {s.alors}
                </Typography>
              ))}
            </Stack>
          ) : (
            n.siDecoche && <Box sx={{ mt: 1 }}>{n.siDecoche}</Box>
          )}
        </Box>
      </Stack>

      {n.enfants && n.enfants.length > 0 && (
        <Stack
          spacing={1.5}
          sx={{
            mt: 1.5,
            ml: { xs: 1.5, sm: 3 },
            pl: { xs: 1.5, sm: 2 },
            borderLeft: "2px solid",
            borderColor: "divider",
          }}
        >
          {n.enfants.map((e, i) => (
            <Noeud
              key={e.cle}
              n={e}
              onBasculer={onBasculer}
              desactive={desactive}
              numero={`${numero}.${i + 1}`}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function ArbreDeQuestions({
  noeuds,
  onBasculer,
  desactive = false,
}: {
  noeuds: NoeudQuestion[];
  onBasculer: (cle: string, coche: boolean) => void;
  desactive?: boolean;
}) {
  return (
    <Stack spacing={1.5}>
      {noeuds.map((n, i) => (
        <Noeud
          key={n.cle}
          n={n}
          onBasculer={onBasculer}
          desactive={desactive}
          numero={String(i + 1)}
        />
      ))}
    </Stack>
  );
}
