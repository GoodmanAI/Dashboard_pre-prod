"use client";

import { useEffect, useRef, useState } from "react";
import { io as ioClient, Socket } from "socket.io-client";

/**
 * Hook client-side qui expose le compteur d'ordonnances en attente pour un
 * userProductId donne. Utilise par le badge navbar/header pour afficher en
 * temps quasi-reel le nombre de patients dont le lien de depot a ete envoye
 * il y a plus de `alertAfterHours` (config centre).
 *
 * Strategie hybride :
 *   1. Fetch initial GET /api/prescriptions/alerts/count au mount
 *   2. Subscribe socket.io -> event "prescription-alerts-updated" emis par :
 *        - POST /api/prescriptions/alerts/[id]/resolve (secretaire marque traite)
 *        - POST /api/prescriptions/[token]/upload      (patient depose son PDF)
 *      A la reception, on re-fetch (payload ignoree, on evite le multi-tenant
 *      routing cote client — le count est trivial cote serveur).
 *   3. Poll de fallback toutes les 5 min pour capter les "aging" (rows dont
 *      createdAt franchit le seuil sans qu'aucun event ne se declenche).
 *
 * Comportement edge cases :
 *   - userProductId invalide (null / <= 0) : hook inerte, retourne 0
 *   - Socket connect echoue (proxy WS bloque, etc.) : le poll 5 min prend le
 *     relais, badge un peu moins reactif mais fonctionnel
 *   - AbortController + cancelled flag : evite les race conditions au
 *     changement rapide de centre (switchCentre dans le header)
 *   - Erreurs reseau silencieuses : le badge disparait plutot que UI cassee
 */

const FALLBACK_POLL_INTERVAL_MS = 5 * 60_000; // 5 min

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

  // Ref sur le dernier userProductId pour ignorer les reponses tardives
  // d'un fetch lance avant un switch de centre.
  const activeIdRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

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

    // Fetch initial + poll fallback
    fetchOnce();
    const interval = setInterval(fetchOnce, FALLBACK_POLL_INTERVAL_MS);

    // Socket subscription : init serveur puis connect client
    // (meme pattern que /calls/page.tsx pour call-treated / call-flagged).
    let socketCleanup: (() => void) | null = null;
    (async () => {
      try {
        await fetch("/api/socket");
        if (cancelled) return;

        const socket = ioClient({ path: "/api/socket" });
        socketRef.current = socket;

        socket.on("prescription-alerts-updated", () => {
          // Payload ignoree : le count est trivial cote serveur, on refetch
          // sans filter. Evite un routing multi-tenant fragile cote client.
          if (activeIdRef.current === userProductId) {
            fetchOnce();
          }
        });

        socketCleanup = () => {
          socket.off("prescription-alerts-updated");
          socket.disconnect();
        };
      } catch {
        // Init socket echoue : on tombe silencieusement sur le poll 5 min
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
      if (socketCleanup) socketCleanup();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userProductId]);

  return state;
}
