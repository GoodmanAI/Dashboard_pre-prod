export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { centimesDepuisSaisie, type Tarifs } from "@/lib/sallesFacturees";
import { ecrireTarifs, lignesFacturation, lireTarifs } from "@/lib/sallesFactureesLecture";

/**
 * Facturation à la salle, tous clients. Plan `plans/2026-11-salles-facturees-talk-konnect.md`.
 *
 *   GET /api/admin/facturation              → { tarifs, lignes, totalCts }
 *   GET /api/admin/facturation?format=csv   → le même tableau en CSV (Excel, `;`)
 *   PUT /api/admin/facturation  { tarifs: { talk: "325", konnect: "95" } }  (euros TTC)
 *
 * Montants mensuels TTC, par client et par site Xplore : le regroupement de sites en un
 * client se fera plus tard (Enzo, 02/11/2026). Admin seul.
 */

function montants(l: { talk: number; konnect: number }, t: Tarifs) {
  const talk = l.talk * t.talk;
  const konnect = l.konnect * t.konnect;
  return { talkCts: talk, konnectCts: konnect, totalCts: talk + konnect };
}

function celluleCsv(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function eurosCsv(cts: number): string {
  return (cts / 100).toFixed(2).replace(".", ",");
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const [tarifs, brutes] = await Promise.all([lireTarifs(), lignesFacturation()]);
  const lignes = brutes.map((l) => ({ ...l, ...montants(l, tarifs) }));
  const totalCts = lignes.reduce((s, l) => s + l.totalCts, 0);

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const entete = [
      "Client",
      "Site",
      "Salles Talk",
      "Montant Talk (EUR TTC)",
      "Salles Konnect",
      "Montant Konnect (EUR TTC)",
      "Total mensuel (EUR TTC)",
      "A regler",
    ];
    const corps = lignes.map((l) =>
      [
        l.nom,
        l.codeSite ?? "",
        l.talk,
        eurosCsv(l.talkCts),
        l.konnect,
        eurosCsv(l.konnectCts),
        eurosCsv(l.totalCts),
        l.aRegler.map((p) => (p === "talk" ? "Talk" : "Konnect")).join(" et "),
      ]
        .map(celluleCsv)
        .join(";")
    );
    corps.push(["Total", "", "", "", "", "", eurosCsv(totalCts), ""].join(";"));
    const jour = new Date().toISOString().slice(0, 10);
    // BOM : sans lui, Excel lit les accents de travers.
    return new NextResponse("﻿" + [entete.join(";"), ...corps].join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="facturation-salles-${jour}.csv"`,
        "Cache-Control": "no-cache",
      },
    });
  }

  return NextResponse.json({ tarifs, lignes, totalCts }, { headers: { "Cache-Control": "no-cache" } });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const corps = await req.json().catch(() => null);
  const talk = centimesDepuisSaisie(corps?.tarifs?.talk);
  const konnect = centimesDepuisSaisie(corps?.tarifs?.konnect);
  if (talk === null || konnect === null) {
    return NextResponse.json(
      { error: "Saisissez un prix en euros pour chaque produit, par exemple 325 ou 95,50." },
      { status: 400 }
    );
  }
  const avant = await lireTarifs();
  try {
    await ecrireTarifs({ talk, konnect });
  } catch (e) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json(
        { error: "La table des tarifs n'existe pas encore sur ce serveur. Passez le SQL du 02/11 avant d'enregistrer." },
        { status: 503 }
      );
    }
    throw e;
  }
  auditLog("account", "tarifs-salle", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "tarif", id: "salle", label: "Prix par salle" },
    metadata: { avant, apres: { talk, konnect } },
  });
  return GET(req);
}
