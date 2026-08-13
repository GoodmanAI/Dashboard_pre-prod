/**
 * Page 404 dediee au sous-domaine depot-ordonnances.neuracorp.ai.
 *
 * Declenchee par notFound() dans [shortCode]/page.tsx quand :
 *   - Le shortCode est absent, trop court ou trop long
 *   - Le shortCode n'existe pas en base
 *
 * IMPORTANT : server component pur (pas de "use client", pas de MUI). En
 * App Router, un not-found.tsx en client component peut faire renvoyer un
 * HTTP 200 au lieu du 404 attendu (Next.js ne detecte pas toujours
 * l'intention "not found" quand l'UI est hydratee cote client). En server
 * component avec styling inline, on garantit :
 *   - Status HTTP 404 (correct pour monitoring, crawlers, uptime checks)
 *   - HTML statique grep-able (test end-to-end via curl fonctionne)
 *   - Pas de bundle JS supplementaire pour une page rare
 *
 * On ne differencie PAS "lien invalide" vs "lien expire" vs "lien inconnu"
 * pour ne pas reveler l'existence d'un shortCode donne (defense contre
 * l'enumeration). Message generique + invitation a contacter le centre.
 */

const BRAND_TEAL = "var(--accent)";
const DANGER = "#E15554";
const DANGER_SOFT = "#FBECEB";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const CARD_BG = "#FFFFFF";
const PAGE_BG_TOP = "#F0F7F5";
const PAGE_BG_BOTTOM = "#FAFCFB";
const TIP_BG = "#F0F7F5";

export default function PrescriptionNotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${PAGE_BG_TOP} 0%, ${PAGE_BG_BOTTOM} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: CARD_BG,
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(31, 52, 72, 0.08)",
          padding: 32,
          width: "100%",
          maxWidth: 480,
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: DANGER_SOFT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
          aria-hidden="true"
        >
          {/* Icone LinkOff en SVG inline (evite d'importer MUI) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill={DANGER}
          >
            <path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.31 2.99l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16v-2zM2 4.27l3.11 3.11C3.29 8.12 2 9.91 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4.01 1.27-1.27L3.27 3 2 4.27z" />
          </svg>
        </div>

        <h1
          style={{
            color: TEXT_MAIN,
            fontWeight: 700,
            fontSize: 20,
            margin: "0 0 12px",
          }}
        >
          Lien invalide ou expire
        </h1>

        <p
          style={{
            color: TEXT_MUTED,
            fontSize: 14,
            lineHeight: 1.55,
            margin: "0 auto 20px",
            maxWidth: 380,
          }}
        >
          Ce lien de depot d&apos;ordonnance n&apos;est pas valide, ou il a
          expire. Verifiez le lien recu par SMS, ou contactez votre centre
          d&apos;imagerie pour recevoir un nouveau lien.
        </p>

        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: TIP_BG,
            textAlign: "left",
          }}
        >
          <div
            style={{
              color: BRAND_TEAL,
              fontWeight: 600,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            Astuce
          </div>
          <div style={{ color: TEXT_MAIN, fontSize: 13, lineHeight: 1.5 }}>
            Les liens de depot restent valides quelques jours seulement apres
            votre prise de rendez-vous.
          </div>
        </div>
      </div>
    </div>
  );
}
