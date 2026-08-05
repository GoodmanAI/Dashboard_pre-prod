/**
 * Webhook Azure warm-up (chantier 2026-08-05, Contrat B).
 *
 * Apres chaque mutation d'un ModuleInfoItem d'un centre :
 *   POST $AZURE_REBUILD_WEBHOOK_URL
 *   Headers: X-Api-Key: $AZURE_WEBHOOK_API_KEY
 *   Body: { userproductID: string, version: string }
 *
 * La brique Azure Functions module_info recoit ce signal et va aller
 * chercher la nouvelle version des Q/R via GET /api/module-info/[userProductId]
 * puis reconstruit sa base de connaissances AVANT qu'un patient n'arrive.
 *
 * Contraintes :
 *   - Fire-and-forget : la sauvegarde cote client dashboard ne doit PAS
 *     attendre la reponse Azure (perf UX).
 *   - Idempotent : reessaie 1-2 fois en cas d'echec reseau (backoff court).
 *   - Log des echecs via console.error -> Loki (label service_name=dashboard,
 *     query "azure webhook").
 *   - Ne throw JAMAIS : le caller n'a pas a s'en soucier.
 *   - Azure a un filet de secours (poll periodique) -> un webhook rate
 *     n'a pas d'impact critique, juste une latence de warm-up plus longue.
 */

const MAX_RETRIES = 2; // 3 tentatives au total (initial + 2 retries)
const RETRY_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 5_000;

interface WebhookPayload {
  userproductID: string;
  version: string;
}

/**
 * Envoie le webhook Azure. Fire-and-forget : la fonction retourne
 * immediatement (Promise resolue), le POST tourne en arriere-plan.
 * En cas d'echec definitif (2 retries epuises), log en error.
 *
 * @param userProductId - id du UserProduct dashboard (int, converti en string)
 * @param version - ISO 8601 string de la nouvelle moduleInfoVersion
 */
export function triggerAzureRebuildWebhook(
  userProductId: number,
  version: string
): void {
  const url = process.env.AZURE_REBUILD_WEBHOOK_URL;
  const apiKey = process.env.AZURE_WEBHOOK_API_KEY;

  if (!url || !apiKey) {
    // Config env manquante : log warn une fois (le webhook n'est pas critique)
    console.warn(
      "[moduleInfoWebhook] AZURE_REBUILD_WEBHOOK_URL ou AZURE_WEBHOOK_API_KEY " +
        "non configure, webhook desactive",
      { userProductId }
    );
    return;
  }

  const payload: WebhookPayload = {
    userproductID: String(userProductId),
    version,
  };

  // Lance en arriere-plan sans await -> le caller n'attend pas
  void sendWithRetries(url, apiKey, payload);
}

async function sendWithRetries(
  url: string,
  apiKey: string,
  payload: WebhookPayload
): Promise<void> {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (res.ok || res.status === 202) {
          // Succes : ne log pas (evite le bruit) sauf si tentative > 0
          if (attempt > 0) {
            console.log(
              `[moduleInfoWebhook] retry succes attempt=${attempt} userproductID=${payload.userproductID}`
            );
          }
          return;
        }

        // HTTP non-OK : log et retry
        lastErr = new Error(`HTTP ${res.status}`);
        console.warn(
          `[moduleInfoWebhook] non-2xx attempt=${attempt} status=${res.status} userproductID=${payload.userproductID}`
        );
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      lastErr = err;
      console.warn(
        `[moduleInfoWebhook] erreur reseau attempt=${attempt} userproductID=${payload.userproductID} err=${
          (err as Error).message ?? "unknown"
        }`
      );
    }

    // Attend avant le prochain retry (sauf si dernier)
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  // Toutes les tentatives ont echoue : log error (visible dans Loki)
  console.error(
    `[moduleInfoWebhook] ECHEC DEFINITIF apres ${MAX_RETRIES + 1} tentatives ` +
      `userproductID=${payload.userproductID} version=${payload.version} ` +
      `err=${(lastErr as Error)?.message ?? "unknown"}`
  );
}
