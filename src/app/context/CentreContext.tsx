"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { cheminCentre, lireCheminCentre } from "@/lib/cheminsCentre";

/**
 * Représentation minimale d’un centre (utilisateur géré).
 * Alignée sur la structure renvoyée par `/api/client`.
 */
export interface ManagedUser {
  id: number;
  userProductId: number;
  name?: string | null;
  email: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  userProducts: Array<any>
}

/**
 * Signature publique du contexte consommé par les composants.
 * (ne pas modifier pour éviter les breaking changes)
 */
interface CentreContextType {
  /** Liste visible dans le sélecteur du Header (filtrée selon les centres actifs pour ADMIN). */
  centres: ManagedUser[];
  /** Liste brute de tous les centres disponibles (ADMIN : tous les clients gérés). */
  allCentres: ManagedUser[];
  /** IDs des centres explicitement activés par l'ADMIN. `null` = pas de filtre actif (tous visibles). */
  activeCentreIds: number[] | null;
  /** Met à jour la sélection d'ADMIN (liste d'IDs visibles). `null` ou vide = pas de filtre. */
  setActiveCentreIds: (ids: number[] | null) => void;
  selectedCentre: ManagedUser | null;
  selectedUserId: number | null; // alias pratique de selectedCentre?.id
  setSelectedCentreById: (id: number) => void;
}

/** Clé de persistance de l’ID centre sélectionné (localStorage). */
const STORAGE_KEY = "lyrae_selected_centre_id";
/** Clé de persistance des centres actifs côté ADMIN (localStorage). */
const ACTIVE_CENTRES_KEY = "lyrae_admin_active_centre_ids";

/**
 * Retourne le userProductId "effectif" d'un centre pour affichage/tri :
 * - en priorité `c.userProductId` (ADMIN via /api/admin/centres)
 * - sinon l'id du premier UserProduct dont le produit contient "Talk".
 */
export const getCentreUserProductId = (c: ManagedUser): number | null => {
  if (c.userProductId) return c.userProductId;
  const talk = (c.userProducts || []).find(
    (p: any) => p?.product?.name?.includes("Talk")
  );
  return talk?.id ?? null;
};

const CentreContext = createContext<CentreContextType | undefined>(undefined);

export const CentreProvider = ({ children }: { children: ReactNode }) => {
  const { data: session, status } = useSession();
  const [allCentres, setAllCentres] = useState<ManagedUser[]>([]);
  const [activeCentreIds, setActiveCentreIdsState] = useState<number[] | null>(null);
  const [selectedCentre, setSelectedCentre] = useState<ManagedUser | null>(null);
  const router = useRouter();
  const pathname: any = usePathname();

  // Restaure la préférence ADMIN (centres actifs) depuis localStorage
  useEffect(() => {
    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
      setActiveCentreIdsState(null);
      return;
    }
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(ACTIVE_CENTRES_KEY);
    if (!raw) {
      setActiveCentreIdsState(null);
      return;
    }
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const normalized = arr
          .map((n: unknown) => Number(n))
          .filter((n) => Number.isFinite(n));
        setActiveCentreIdsState(normalized.length ? normalized : null);
      }
    } catch {
      setActiveCentreIdsState(null);
    }
  }, [session?.user?.role]);

  /**
   * Met à jour la préférence ADMIN de centres actifs (liste + persistance).
   * `null` ou liste vide retire le filtre (tous les centres redeviennent visibles).
   */
  const setActiveCentreIds = (ids: number[] | null) => {
    if (!ids || ids.length === 0) {
      setActiveCentreIdsState(null);
      if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_CENTRES_KEY);
      return;
    }
    setActiveCentreIdsState(ids);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_CENTRES_KEY, JSON.stringify(ids));
    }
  };

  /**
   * Liste brute triée par userProductId ascendant (affichée sur la page admin home).
   */
  const sortedAllCentres = useMemo<ManagedUser[]>(() => {
    return [...allCentres].sort((a, b) => {
      const ua = getCentreUserProductId(a) ?? Number.MAX_SAFE_INTEGER;
      const ub = getCentreUserProductId(b) ?? Number.MAX_SAFE_INTEGER;
      return ua - ub;
    });
  }, [allCentres]);

  /**
   * Liste visible dans le sélecteur Header (triée puis filtrée).
   * Pour les ADMIN avec filtre actif : intersection avec `activeCentreIds`.
   * Sinon : liste complète.
   */
  const centres = useMemo<ManagedUser[]>(() => {
    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") return sortedAllCentres;
    if (!activeCentreIds || activeCentreIds.length === 0) return sortedAllCentres;
    const set = new Set(activeCentreIds);
    return sortedAllCentres.filter((c) => set.has(c.id));
  }, [sortedAllCentres, activeCentreIds, session?.user?.role]);

  /**
   * Chargement initial des centres lorsque la session est authentifiée.
   * - GET `/api/client` pour obtenir `centreRole` et `managedUsers`.
   * - Si l’utilisateur n’est pas ADMIN_USER, nettoyage de l’état et du stockage local.
   */
  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    (async () => {
      try {
        // ADMIN / SUPER_ADMIN (rôle applicatif) : accès à tous les centres via /api/admin/centres
        if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
          const resAll = await fetch("/api/admin/centres", { cache: "no-store" });
          if (cancelled) return;

          if (resAll.ok) {
            const list: ManagedUser[] = await resAll.json();
            setAllCentres(list);

            const raw =
              (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "";
            const storedId = Number(raw);
            const fallback = list[0] ?? null;
            const initial = list.find((u) => u.id === storedId) || fallback;

            setSelectedCentre(initial || null);
            if (initial) {
              localStorage.setItem(STORAGE_KEY, String(initial.id));
            } else {
              localStorage.removeItem(STORAGE_KEY);
            }
            return;
          }
        }

        const res = await fetch("/api/client", { cache: "no-store" });

        const data = await res.json();
        if (cancelled) return;

        if (data?.centreRole === "ADMIN_USER" && Array.isArray(data?.managedUsers)) {
          // FIX 2026-08-05 : inclure le compte parent (data) EN PLUS des managed.
          // Sans ca, un ADMIN_USER voit uniquement les centres qu'il manage
          // mais pas le sien -> impossible de revenir sur son propre centre
          // via le selecteur multi-centres.
          const list: ManagedUser[] = [data, ...data.managedUsers];
          setAllCentres(list);

          // Restauration d’une sélection précédente si valide, sinon fallback au premier centre.
          const raw = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "";
          const storedId = Number(raw);
          const fallback = list[0] ?? null;
          const initial =
            list.find((u) => u.id === storedId) || fallback;

          setSelectedCentre(initial || null);

          // Re-synchronise le storage si besoin
          if (initial) {
            localStorage.setItem(STORAGE_KEY, String(initial.id));
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        } else {
          // Centre appartenant à un groupe multi-centres (Montchanin /
          // Le Creusot, Quimper / Fouesnant / Pont-l'Abbé, ...). La liste des
          // groupes est une règle d'autorisation : elle vit côté serveur, dans
          // `@/lib/groupesCentres`, et le front se contente de la demander.
          // Auparavant elle était recopiée ici en `if (data.id == 7 || ...)`,
          // ce qui ne savait exprimer que des paires.
          const resLies = await fetch("/api/centres-lies", { cache: "no-store" });
          const lies = resLies.ok ? await resLies.json() : [];
          if (cancelled) return;

          if (Array.isArray(lies) && lies.length > 0) {
            setAllCentres([data, ...lies]);
          } else {
            setAllCentres([]);
            setSelectedCentre(null);
            if (typeof window !== "undefined") {
              localStorage.removeItem(STORAGE_KEY);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load centres:", err);
        setAllCentres([]);
        setSelectedCentre(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.role]);

  /**
   * Si la liste des centres change et que le centre sélectionné actuel
   * n’en fait plus partie, on force un fallback propre.
   */
  useEffect(() => {
    if (!centres.length) return;
    if (selectedCentre && centres.some((c) => c.id === selectedCentre.id)) return;

    const raw = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "";
    const storedId = Number(raw);
    const next =
      centres.find((c) => c.id === storedId) || centres[0] || null;

    setSelectedCentre(next);
    if (next) {
      localStorage.setItem(STORAGE_KEY, String(next.id));
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centres]);

  /**
   * Synchronisation automatique du centre sélectionné avec l'URL.
   * Quand on navigue vers /client/c/{userId}/{produit}/...,
   * on met à jour `selectedCentre` pour que le Header, la Sidebar et tout consommateur
   * du contexte reflètent le centre réellement affiché. Gère les cas :
   * - clic sur une card "centre" qui navigue directement (sans passer par setSelectedCentreById)
   * - arrivée via lien externe / bookmark / back-forward
   */
  useEffect(() => {
    if (!allCentres.length || !pathname) return;

    // URL par client (chantier U) : l'identifiant EST celui du centre, il n'y a
    // rien à traduire. C'est le cas de toutes les pages de centre depuis le
    // 31/08/2026 ; le reste ne sert plus qu'aux liens encore en circulation.
    const cible = lireCheminCentre(pathname);
    const match = cible
      ? allCentres.find((c) => c.id === cible.userId)
      : (() => {
          const m = pathname.match(/^\/client\/services\/talk\/(\d+)(?:\/|$)/);
          const urlUpid = m ? Number(m[1]) : NaN;
          if (!Number.isFinite(urlUpid)) return undefined;
          return allCentres.find((c) => getCentreUserProductId(c) === urlUpid);
        })();

    if (!match) return;
    if (selectedCentre?.id === match.id) return;

    setSelectedCentre(match);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(match.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, allCentres]);

  /**
   * Change le centre actif et persiste l'ID en localStorage.
   *
   * Le parametre `id` est le userProductId (talkId) du centre cible, envoye
   * par le <Select> du Header.
   *
   * FIX 2026-08-05 : reecriture complete pour supporter proprement le
   * pattern ADMIN_USER + managerId (multi-centres). L'ancien code faisait
   * `centres.find((c) => c.userProductId === id)` mais les centres managed
   * ne exposent pas ce champ directement — juste userProducts[]. On utilise
   * maintenant getCentreUserProductId() qui gere les 2 cas.
   *
   * URL navigation : le centre courant est lu depuis l'URL (plus fiable que
   * de dependre du state selectedCentre qui peut etre stale au moment du
   * clic). Si on est deja sur une page centre, on ne remplace QUE
   * l'identifiant du client : l'ecran et le produit regardes ne bougent pas,
   * ce qui est tout l'interet d'une URL par client (chantier U, 31/08/2026).
   * Auparavant il fallait echanger un userProductId contre un autre, sans
   * rapport visible entre eux, et les deux roles avaient chacun leur prefixe.
   *
   * Si le centre d'arrivee n'a pas le produit regarde, l'ecran le dit
   * franchement (AttenteCentre) plutot que de tourner dans le vide.
   */
  const setSelectedCentreById = async (id: number) => {
    const centre = centres.find((c) => getCentreUserProductId(c) === id) ?? null;
    if (!centre) return;

    setSelectedCentre(centre);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(centre.id));
    }

    const cible = lireCheminCentre(pathname);

    // Cas 1 : pas sur une page centre -> on ouvre la liste des appels du nouveau.
    if (!cible) {
      router.push(cheminCentre(centre.id, "talk", "calls"));
      router.refresh();
      return;
    }

    // Cas 2 : deja sur une page centre -> meme ecran, autre client.
    if (cible.userId === centre.id) return;
    const newPath = pathname.replace(
      `/client/c/${cible.userId}/`,
      `/client/c/${centre.id}/`
    );
    if (newPath !== pathname) {
      router.replace(newPath);
      router.refresh();
    }
  };




  return (
    <CentreContext.Provider
      value={{
        centres,
        allCentres: sortedAllCentres,
        activeCentreIds,
        setActiveCentreIds,
        selectedCentre,
        selectedUserId: selectedCentre?.id ?? null,
        setSelectedCentreById,
      }}
    >
      {children}
    </CentreContext.Provider>
  );
};

export const useCentre = (): CentreContextType => {
  const context = useContext(CentreContext);
  if (!context) throw new Error("useCentre must be used within a CentreProvider");
  return context;
};
