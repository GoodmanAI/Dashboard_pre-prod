"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { usePremiersPas } from "@/hooks/usePremiersPas";
import { hasPermission } from "@/lib/permissions";
import { cheminCentre } from "@/lib/cheminsCentre";
import { chapitresDuProduit } from "@/lib/premiersPas";
import {
  etatChapitre,
  type Chapitre,
  type EtatChapitre,
  type Etape,
} from "@/lib/tutoriel/types";
import Visite from "./Visite";
import ChoixChapitre from "./ChoixChapitre";

/**
 * Le tutoriel du client (plan `2026-10-tutoriel-client-talk.md`) : ce que la personne
 * peut voir, l'état de chaque chapitre, la visite en cours.
 *
 * Monté une fois autour de l'application (`app/layout.tsx`) : la visite survit aux
 * changements de page, puisqu'un chapitre emmène d'un écran à l'autre.
 *
 * **Personne d'autre que le client.** Un administrateur qui regarde l'écran d'un
 * client ne reçoit ni visite ni sommaire (la route `premiers-pas` le lui dit). Un
 * sous-compte ne voit que les chapitres des écrans qu'il a le droit d'ouvrir, et
 * seulement leurs étapes qu'il peut atteindre.
 */

type VisiteEnCours = { chapitre: Chapitre; etapes: Etape[]; index: number };

export type Tutoriel = {
  /** Faux hors d'un écran de centre, pour un admin, ou tant que l'état n'est pas lu. */
  disponible: boolean;
  chapitres: Chapitre[];
  etats: Record<string, EtatChapitre>;
  vus: string[];
  visite: VisiteEnCours | null;
  demarrer: (cle: string) => void;
  quitter: () => void;
  aller: (index: number) => void;
  choixOuvert: boolean;
  ouvrirChoix: () => void;
  fermerChoix: () => void;
};

const Contexte = createContext<Tutoriel | null>(null);

/** Le contexte brut, pour monter la visite sur des données factices (page d'aperçu). */
export const ContexteTutorielBrut = Contexte;

export function useTutoriel(): Tutoriel | null {
  return useContext(Contexte);
}

export function TutorielProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { userId, userProductId, produit } = useCentreProduit();
  const { etat, admin, agir } = usePremiersPas();
  const [manques, setManques] = useState<Set<string> | null>(null);
  const [visite, setVisite] = useState<VisiteEnCours | null>(null);
  const [choixOuvert, setChoixOuvert] = useState(false);

  const peutLire = useCallback(
    (page: Chapitre["page"]) =>
      page === null ||
      (!!session?.user && hasPermission(session.user as any, page, "read")),
    [session],
  );

  const chapitres = useMemo(
    () => chapitresDuProduit(produit).filter((c) => peutLire(c.page)),
    [produit, peutLire],
  );
  // `userProductId` : le compte a VRAIMENT ce produit. Sans lui, l'URL désigne un
  // produit que le centre n'a pas (« Ce centre n'a pas LyraeTalk ») : pas de visite.
  const disponible =
    !!etat &&
    !admin &&
    userId !== null &&
    userProductId !== null &&
    chapitres.length > 0;

  // L'état des chapitres vient du registre de complétude, relu à chaque ouverture du
  // choix ou de la visite : une correspondance remplie entre-temps passe « à vérifier ».
  const lireManques = useCallback(async () => {
    if (!userProductId) return;
    try {
      const r = await fetch(`/api/completude?userProductId=${userProductId}`, {
        cache: "no-store",
      });
      const d = r.ok ? await r.json() : null;
      // Lecture ratée : état inconnu (null), jamais « tout est rempli ». Les textes
      // retombent alors sur leur version qui insiste.
      // `tutoriel` : les manques réservés à l'admin que le tutoriel doit connaître
      // (catalogue Konnect vide), sans qu'ils paraissent dans le bandeau du client.
      setManques(
        Array.isArray(d?.manques)
          ? new Set([
              ...d.manques.map((m: { cle: string }) => m.cle),
              ...(Array.isArray(d?.tutoriel) ? d.tutoriel : []),
            ])
          : null,
      );
    } catch {
      setManques(null);
    }
  }, [userProductId]);

  useEffect(() => {
    if (disponible) void lireManques();
  }, [disponible, lireManques]);

  const etats = useMemo(
    () =>
      Object.fromEntries(
        chapitres.map((c) => [c.cle, etatChapitre(c, manques)]),
      ),
    [chapitres, manques],
  );

  const demarrer = useCallback(
    (cle: string) => {
      const chapitre = chapitres.find((c) => c.cle === cle);
      if (!chapitre || userId === null || !produit) return;
      const etapes = chapitre.etapes.filter((e) => !e.page || peutLire(e.page));
      if (etapes.length === 0) return;
      setChoixOuvert(false);
      void lireManques();
      setVisite({ chapitre, etapes, index: 0 });
    },
    [chapitres, userId, produit, peutLire, lireManques],
  );

  const quitter = useCallback(() => setVisite(null), []);

  const aller = useCallback(
    (index: number) => {
      if (!visite) return;
      if (index >= visite.etapes.length) {
        // Chapitre parcouru jusqu'au bout : noté, la liste le montre.
        void agir({ chapitre: visite.chapitre.cle });
        setVisite(null);
        return;
      }
      setVisite({ ...visite, index: Math.max(0, index) });
    },
    [visite, agir],
  );

  // Une étape sur un autre écran : on y va. Le chemin d'une étape sans `chemin` est
  // celui de la précédente qui en a un.
  const cheminVoulu = useMemo(() => {
    if (!visite || userId === null || !produit) return null;
    for (let i = visite.index; i >= 0; i--) {
      const c = visite.etapes[i].chemin;
      if (c !== undefined) return cheminCentre(userId, produit, c);
    }
    return null;
  }, [visite, userId, produit]);

  useEffect(() => {
    if (cheminVoulu && window.location.pathname !== cheminVoulu)
      router.push(cheminVoulu);
  }, [cheminVoulu, router]);

  // Première connexion d'un compte neuf : la visite de bienvenue démarre une fois.
  // Les comptes antérieurs portent `masque: true` (SQL du 29/10) et ne la voient pas.
  const lancee = useRef(false);
  useEffect(() => {
    if (lancee.current || !disponible || !etat || etat.masque || etat.visite)
      return;
    lancee.current = true;
    void agir({ visite: true });
    demarrer(chapitres[0].cle);
  }, [disponible, etat, agir, demarrer, chapitres]);

  // `?tutoriel=1` à l'accueil d'un produit ouvre la liste des chapitres : c'est ainsi
  // que la page « Mon profil », qui vit hors d'un écran de centre (le tutoriel n'y est
  // pas disponible), y mène (30/10/2026). Le paramètre est retiré aussitôt, pour qu'un
  // rechargement ne rouvre pas la liste. `window.location` plutôt que
  // `useSearchParams`, qui forcerait une frontière Suspense autour de toute l'application.
  const demandeLue = useRef(false);
  useEffect(() => {
    if (!disponible) {
      demandeLue.current = false;
      return;
    }
    const url = new URL(window.location.href);
    if (demandeLue.current || url.searchParams.get("tutoriel") !== "1") return;
    demandeLue.current = true;
    url.searchParams.delete("tutoriel");
    router.replace(url.pathname + url.search);
    // Compte qui n'a jamais vu la visite de bienvenue : elle démarre d'elle-même
    // (effet ci-dessus), la liste par-dessus ferait deux fenêtres à la fois.
    if (etat && !etat.masque && !etat.visite) return;
    void lireManques();
    setChoixOuvert(true);
  }, [disponible, etat, router, lireManques]);

  const valeur: Tutoriel = {
    disponible,
    chapitres,
    etats,
    vus: etat?.chapitres ?? [],
    visite,
    demarrer,
    quitter,
    aller,
    choixOuvert,
    ouvrirChoix: () => {
      void lireManques();
      setChoixOuvert(true);
    },
    fermerChoix: () => setChoixOuvert(false),
  };

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {disponible && <ChoixChapitre />}
      {disponible && visite && cheminVoulu && (
        <Visite cheminVoulu={cheminVoulu} />
      )}
    </Contexte.Provider>
  );
}
