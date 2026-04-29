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
  let currentCentre = (selectedCentre?.userProducts?.find((c: any) => c?.product?.name?.includes("Talk"))?.id || selectedCentre?.id) ?? null;
  const router = useRouter();
  const pathname: any = usePathname();

  // Restaure la préférence ADMIN (centres actifs) depuis localStorage
  useEffect(() => {
    if (session?.user?.role !== "ADMIN") {
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
    if (session?.user?.role !== "ADMIN") return sortedAllCentres;
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
        // ADMIN (rôle applicatif) : accès à tous les centres via /api/admin/centres
        if (session?.user?.role === "ADMIN") {
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
        console.log("data", data)
        currentCentre = data.id;
        if (cancelled) return;

        if (data?.centreRole === "ADMIN_USER" && Array.isArray(data?.managedUsers)) {
          const list: ManagedUser[] = data.managedUsers;
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
        } else if (data.id == 7 || data.id == 8) {
          if (data.id == 7) {
            const res = await fetch("/api/users/8", { cache: "no-store" });

            const otherCentre = await res.json();
            setAllCentres([data, otherCentre]);
          } else {
            const res = await fetch("/api/users/7", { cache: "no-store" });
            const otherCentre = await res.json();
            setAllCentres([data, otherCentre]);
          }
        } else if (data.id == 12 ||data.id == 13) {
          if (data.id == 12) {
            const res = await fetch("/api/users/13", { cache: "no-store" });
            const otherCentre = await res.json();
            setAllCentres([data, otherCentre]);
          } else {
            const res = await fetch("/api/users/12", { cache: "no-store" });
            const otherCentre = await res.json();
            setAllCentres([data, otherCentre]);
          }
        } else {
          setAllCentres([]);
          setSelectedCentre(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
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
   * Quand on navigue vers /admin/clients/{upid}/... ou /client/services/talk/{upid}/...,
   * on met à jour `selectedCentre` pour que le Header, la Sidebar et tout consommateur
   * du contexte reflètent le centre réellement affiché. Gère les cas :
   * - clic sur une card "centre" qui navigue directement (sans passer par setSelectedCentreById)
   * - arrivée via lien externe / bookmark / back-forward
   */
  useEffect(() => {
    if (!allCentres.length || !pathname) return;
    const m = pathname.match(
      /^\/(?:admin\/clients|client\/services\/talk)\/(\d+)(?:\/|$)/
    );
    if (!m) return;
    const urlUpid = Number(m[1]);
    if (!Number.isFinite(urlUpid)) return;

    const match = allCentres.find((c) => getCentreUserProductId(c) === urlUpid);
    if (!match) return;
    if (selectedCentre?.id === match.id) return;

    setSelectedCentre(match);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(match.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, allCentres]);

  /**
   * Change le centre actif et persiste l’ID en localStorage.
   */
  const setSelectedCentreById = async (id: number) => {
    let centre: any = centres.find((c) => c.userProductId === id) || null;
    if (!centre) {
      centre =
        centres.find((c: any) =>
          (c.userProducts ?? []).find((e: any) =>
            e?.product?.name?.includes("Talk")
          )
        ) || centres.find((c: any) => c.userProductId == id);
    }

    if (!centre) return;

    setSelectedCentre(centre);

    if (centre) localStorage.setItem(STORAGE_KEY, String(centre.id));
    else localStorage.removeItem(STORAGE_KEY);

    const userProductId =
      centre.userProductId ??
      (centre.userProducts ?? []).find((e: any) =>
        e?.product?.name?.includes("Talk")
      )?.id;

    if (!userProductId) return;

    const isAdmin = session?.user?.role === "ADMIN";
    const onClientTalkPath = /^\/client\/services\/talk\/\d+/.test(pathname || "");
    const onAdminClientPath = /^\/admin\/clients\/\d+/.test(pathname || "");
    const canInlineReplace = onClientTalkPath || onAdminClientPath;

    // Si l'utilisateur n'est pas déjà sur une page centre (talk/clients), redirection vers la
    // page d'appels du centre fraîchement sélectionné, en respectant le préfixe lié au rôle.
    if (!canInlineReplace) {
      if (userProductId) {
        const target = isAdmin
          ? `/admin/clients/${userProductId}/calls`
          : `/client/services/talk/${userProductId}/calls`;
        router.push(target);
        router.refresh();
      }
      return;
    }

    let regex = new RegExp(`/${currentCentre}(?=/|$)`);
    let newPath = "";

    if (regex.test(pathname)) {
      newPath = pathname.replace(regex, `/${userProductId}`);
    } else {
      console.log("", centre);
      let toFind  = selectedCentre?.userProductId;
      regex = new RegExp(`/${toFind}(?=/|$)`);
      newPath = pathname.replace(regex, `/${userProductId}`);
    }

    console.log("newPath", newPath);

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
