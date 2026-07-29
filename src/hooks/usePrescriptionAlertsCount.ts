"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hook client-side qui poll GET /api/prescriptions/alerts/count toutes les
 * 60s pour un userProductId donne. Utilise par le badge navbar/header pour
 * afficher en temps quasi-reel le nombre de patients dont l'ordonnance est
 * en attente depuis > `alertAfterHours` (config centre).
 *
 * Comportement :
 *   - Skip complet si userProductId invalide (null / <= 0) -> retourne 0
 *   - Fetch initial au mount + a chaque changement de userProductId
 *   - Poll suivant setInterval, arrete propre au unmount / changement id
 *   - Erreurs reseau silencieuses (badge non affiche plutot que UI cassee)
 *   - AbortController pour eviter les race conditions au changement de
 *     centre rapide
 *
 * Le hook expose `count` et `thresholdHours` (le seuil configure du centre)
 * pour permettre au consommateur d'afficher un tooltip contextuel type
 * "N patients depassent le delai de X heures".
 */

const POLL_INTERVAL_MS = 60_000;

interface AlertCountState {
  count: number;
  thresholdHours: number;
  loading: boolean;
  error: string | null;
}

export function usePrescriptionAlertsCount(
  userProductId: number | null | undefined
): AlertCountState {
  const [state, setState] = useState<AlertCountState>({
    count: 0,
    thresholdHours: 48,
    loading: false,
    error: null,
  });

  // On garde une reference sur le dernier userProductId pour ignorer les
  // reponses tardives d'un fetch qui aurait ete lance avant un switch de
  // centre (evite les affichages incoherents).
  const activeIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userProductId || userProductId <= 0) {
      setState({ count: 0, thresholdHours: 48, loading: false, error: null });
      return;
    }

    activeIdRef.current = userProductId;
    const controller = new AbortController();
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        setState((s) => ({ ...s, loading: true }));
        const res = await fetch(
          `/api/prescriptions/alerts/count?userProductId=${userProductId}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (cancelled || activeIdRef.current !== userProductId) return;

        if (!res.ok) {
          // Silencieux : le badge disparait, pas de banner d'erreur intrusive
          setState({
            count: 0,
            thresholdHours: 48,
            loading: false,
            error: `HTTP ${res.status}`,
          });
          return;
        }
        const data = await res.json();
        if (cancelled || activeIdRef.current !== userProductId) return;

        setState({
          count: Number.isFinite(data?.count) ? data.count : 0,
          thresholdHours: Number.isFinite(data?.thresholdHours)
            ? data.thresholdHours
            : 48,
          loading: false,
          error: null,
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err?.message || "fetch failed",
        }));
      }
    };

    fetchOnce();
    const interval = setInterval(fetchOnce, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [userProductId]);

  return state;
}
