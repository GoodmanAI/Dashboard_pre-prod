"use client";

import { IconChartLine, IconFilePencil, IconFileSpreadsheet, IconScale, IconTarget } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Box, Button, Card, Checkbox, Chip, Collapse, Slider, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import type { DonneesCa, ScenarioCa } from "@/pilot/lib/ca/donnees";
import { chargerChoix, comparaisonAuReel, projectionDepuisDonnees, signatureChoix, type ChoixScenario } from "@/pilot/lib/ca/etat";
import { AVERTISSEMENT_EXPORT, MODELE_TARIFAIRE_VALIDE, periodeExport } from "@/pilot/lib/ca/export";
import type { MoisCourant } from "@/pilot/lib/ca/moisCourant";
import { moisIso } from "@/pilot/lib/ca/reel";
import { decalerMois, resumeProjection } from "@/pilot/lib/ca/projeter";
import { creationScenario, modificationScenario } from "@/pilot/lib/validation/scenario";
import { euros, eurosPrecis } from "@/pilot/lib/argent";
import { compter } from "@/pilot/lib/texte";
import { LIBELLES_PREVISION } from "@/pilot/lib/opportunites/regles";
import { LIBELLES, PROBABILITE_PAR_ETAPE } from "@/pilot/lib/pipeline";
import { Bloc, EnTete } from "@/pilot/components/Bloc";
import { JETONS } from "@/pilot/jetons";

const moisLong = (s: string) => new Date(s).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const moisCourt = (s: string) => new Date(s).toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
const signe = (centimes: number) => `${centimes > 0 ? "+" : ""}${eurosPrecis(centimes)}`;
/** Pour-mille entier vers « +12,5 % », sans flottant. */
const pourcentage = (pm: number) => `${pm > 0 ? "+" : pm < 0 ? "-" : ""}${Math.floor(Math.abs(pm) / 10)},${Math.abs(pm) % 10} %`;
// Les colonnes se partagent la largeur : un tableau ne crée jamais de barre horizontale.
const TABLEAU = { tableLayout: "fixed", "& td, & th": { px: { xs: 0.5, sm: 1.5 }, overflowWrap: "anywhere", fontSize: 13 } } as const;
const GRADUATION = { fontSize: 11, fill: JETONS.secondaire };
const ecartMois = (depuis: string, vers: string) => {
  const a = new Date(depuis), b = new Date(vers);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
};

export function ChiffreAffaires({ donnees: d, scenarioInitial, moisDepart, moisCourant: courant, peutExporter }: {
  donnees: DonneesCa; scenarioInitial: number | null; moisDepart: string; moisCourant: MoisCourant; peutExporter: boolean;
}) {
  const [scenarios, setScenarios] = useState(d.scenarios);
  const [scenarioId, setScenarioId] = useState(scenarioInitial);
  const [choix, setChoix] = useState(() => chargerChoix(d.opportunites, d.scenarios.find((s) => s.id === scenarioInitial)));
  const [dialogue, setDialogue] = useState<"enregistrer" | "copier" | null>(null);
  const [detail, setDetail] = useState(false);
  // Changer de scénario avec des modifications en cours demande confirmation : elles seraient perdues.
  const [aCharger, setACharger] = useState<{ id: number | null } | null>(null);
  const [periode, setPeriode] = useState(() => {
    const dernier = moisIso(decalerMois(new Date(moisDepart), -1));
    return { de: d.reel.length ? moisIso(new Date(d.reel[0].mois)) : dernier, a: dernier };
  });
  const scenario = scenarios.find((s) => s.id === scenarioId);
  const reference = chargerChoix(d.opportunites, scenario);
  const modifie = signatureChoix(choix) !== signatureChoix(reference);
  const ajoutees = scenario ? d.opportunites.filter((o) => !scenario.opportunites.some((c) => c.opportuniteId === o.id)).length : 0;
  // Ce calcul pur sert aussi au rendu serveur initial. Aucun effet réseau ne dépend des choix.
  const projection = useMemo(() => projectionDepuisDonnees(d, choix, new Date(moisDepart)), [d, choix, moisDepart]);
  const resume = resumeProjection(projection);
  // Rejouée à chaque coche ou changement de scénario, sans requête.
  const comparaison = useMemo(() => comparaisonAuReel(d, choix), [d, choix]);
  let erreurPeriode: string | null = null;
  try { periodeExport(periode); } catch (erreur) { erreurPeriode = erreur instanceof Error ? erreur.message : "Période invalide."; }
  const texteMoyenne = d.moisMoyenne === 1 ? "Moyenne du dernier mois figé." : `Moyenne des ${compter(d.moisMoyenne, "dernier mois figé", "derniers mois figés")}.`;
  const courbe = projection.map((m) => ({ ...m, mois: m.mois.toISOString() }));
  const estime = d.contratsASaisir.reduce((total, c) => total + c.centimes, 0);
  const groupes = useMemo(() => {
    const parOrganisation = new Map<number, DonneesCa["opportunites"]>();
    for (const o of d.opportunites) { const groupe = parOrganisation.get(o.organisationId) ?? []; groupe.push(o); parOrganisation.set(o.organisationId, groupe); }
    return [...parOrganisation.values()].sort((a, b) => a[0].organisationNom.localeCompare(b[0].organisationNom, "fr"));
  }, [d.opportunites]);

  function urlScenario(id: number | null) {
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete("scenario"); else url.searchParams.set("scenario", String(id));
    window.history.replaceState(null, "", url);
  }
  function charger(id: number | null) {
    setScenarioId(id); setChoix(chargerChoix(d.opportunites, scenarios.find((s) => s.id === id))); urlScenario(id);
  }
  useEffect(() => {
    const retour = () => {
      const id = Number(new URL(window.location.href).searchParams.get("scenario")) || null;
      setScenarioId(id); setChoix(chargerChoix(d.opportunites, scenarios.find((s) => s.id === id)));
    };
    window.addEventListener("popstate", retour);
    return () => window.removeEventListener("popstate", retour);
  }, [d.opportunites, scenarios]);
  function modifier(id: number, champs: Partial<ChoixScenario[number]>) {
    setChoix((actuels) => actuels.map((o) => o.opportuniteId === id ? { ...o, ...champs } : o));
  }
  async function enregistrer(formulaire: FormData) {
    const modifierExistant = dialogue === "enregistrer" && scenario;
    const notes = String(formulaire.get("notes") ?? "");
    const corps = { nom: formulaire.get("nom"), opportunites: choix,
      // Les notes privées ne sont pas chargées dans la projection. Une omission les conserve.
      ...(notes.trim() || !modifierExistant ? { notes } : {}),
      ...(modifierExistant ? { majLe: scenario.majLe } : {}) };
    const { scenario: enregistre } = await envoyer<{ scenario: ScenarioCa }>(modifierExistant ? `/api/pilot/scenarios/${scenario.id}` : "/api/pilot/scenarios",
      modifierExistant ? "PATCH" : "POST", modifierExistant ? modificationScenario : creationScenario, corps);
    setScenarios((actuels) => [...actuels.filter((s) => s.id !== enregistre.id), enregistre].sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
    setScenarioId(enregistre.id); setChoix(chargerChoix(d.opportunites, enregistre)); urlScenario(enregistre.id); setDialogue(null);
  }

  return <Stack spacing={2.5}>
    <EnTete titre="Chiffre d'affaires" sousTitre={`Les 24 prochains mois, à partir de ${moisLong(moisDepart)}.`}>
      <TextField select hiddenLabel value={scenarioId ?? ""} onChange={(e) => { const id = Number(e.target.value) || null; if (modifie) setACharger({ id }); else charger(id); }} SelectProps={{ native: true }} inputProps={{ "aria-label": "Scénario" }}>
        <option value="">Sans scénario : tout compte</option>{scenarios.map((s) => <option key={s.id} value={s.id}>Scénario : {s.nom}</option>)}
      </TextField>
      {modifie && <Chip color="warning" role="status" label="Modifications non enregistrées" />}
      {scenario && <Button variant="outlined" onClick={() => setDialogue("copier")}>Enregistrer sous</Button>}
      <Button variant="contained" onClick={() => setDialogue("enregistrer")}>Enregistrer</Button>
    </EnTete>
    {d.formations.some((f) => f.montantCentimes === null) && <Typography variant="body2" color="warning.main">
      La prévision est incomplète : des formations de POC ont un prix à renseigner. Complétez leur prix dans l&apos;onglet Argent des dossiers signalés dans les alertes.
    </Typography>}
    {ajoutees > 0 && <Typography variant="body2">{compter(ajoutees, "opportunité ajoutée depuis l'enregistrement, cochée par défaut.", "opportunités ajoutées depuis l'enregistrement, cochées par défaut.")}</Typography>}
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))", xl: "repeat(5, minmax(0, 1fr))" } }}>
      <Indicateur titre="Abonnements signés" cle="ca-recurrent" montant={resume.recurrentSigne}>par mois, ce que disent les contrats actifs</Indicateur>
      {/* À part du signé (D-4, C-92) : jamais dans la courbe, le réel figé ni l'export. */}
      <Indicateur titre="Estimé, contrat à saisir" cle="ca-estime" montant={estime}>
        {d.contratsASaisir.length ? `par mois, ${compter(d.contratsASaisir.length, "client signé", "clients signés")} sans contrat actif. Il devient signé quand le contrat est activé.`
          : "Aucun client signé sans contrat actif."}
      </Indicateur>
      <Indicateur titre="Installations et prestations du mois" cle="ca-mise-en-service" montant={resume.miseEnService}>formations comprises, facturées une fois</Indicateur>
      <Indicateur titre="Part à l'usage, à ce jour" cle="ca-variable-jour" montant={courant.variableAuJour}>
        <Box>Jour {courant.jour} sur {courant.joursDuMois}. Projetée à fin de mois : <span data-testid="ca-variable-projetee" data-centimes={courant.variableProjetee}>{eurosPrecis(courant.variableProjetee)}</span></Box>
        {courant.motifs.map((motif) => <Box key={motif} sx={{ color: "warning.main" }}>{motif}.</Box>)}
        <Box>Dans la projection : <span data-testid="ca-variable" data-centimes={resume.variable}>{eurosPrecis(resume.variable)}</span> par mois.</Box>
        <Box>{d.variableDisponible ? texteMoyenne : "Comptée à zéro tant qu'aucun mois n'est figé. Elle viendra avec le réel mensuel."}</Box>
      </Indicateur>
      <Indicateur titre="Ventes probables en plus du signé ce mois-ci" cle="ca-ecart" montant={resume.ecartPondere}>
        <Chip color="warning" label="Modèle tarifaire à valider" sx={{ mt: 0.25 }} />
      </Indicateur>
    </Box>
    {!d.contrats.length && !d.opportunites.length && !d.formations.length ? <Typography>Rien à projeter. Les contrats et les opportunités se créent depuis les fiches.</Typography> : <>
      <Bloc icone={IconChartLine} teinte="sarcelle" titre="Projection sur 24 mois" nombre="signé, probable et optimiste, par mois" entete={<Button size="small" aria-expanded={detail} aria-controls="tableau-ca" onClick={() => setDetail((v) => !v)}>{detail ? "Masquer les chiffres" : "Voir les 24 mois en chiffres"}</Button>}>
        <Box sx={{ height: 300, px: 1.5, pb: 2 }} role="img" aria-label="Projection du chiffre d'affaires : signé, probable et optimiste. Les valeurs exactes sont dans le tableau suivant.">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={courbe} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid stroke={JETONS.rail} vertical={false} />
            <XAxis dataKey="mois" tickFormatter={moisCourt} minTickGap={25} tick={GRADUATION} stroke={JETONS.rail} tickLine={false} />
            <YAxis tickFormatter={euros} width={75} tick={GRADUATION} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(label) => moisLong(String(label))} formatter={(valeur: number) => eurosPrecis(valeur)} contentStyle={{ borderRadius: 12, border: 0, boxShadow: JETONS.ombreFlottante, fontSize: 12 }} />
            <Legend verticalAlign="top" align="left" iconType="plainline" height={28} wrapperStyle={{ fontSize: 13 }} />
            <Line name="Signé" dataKey="signe" stroke={JETONS.encre} strokeWidth={2.5} strokeLinecap="round" dot={false} isAnimationActive={false} />
            <Line name="Probable" dataKey="pondere" stroke={JETONS.accent} strokeWidth={2.5} strokeLinecap="round" dot={false} isAnimationActive={false} />
            <Line name="Optimiste" dataKey="optimiste" stroke={JETONS.secondaire} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart></ResponsiveContainer>
        </Box>
        {/* Toujours rendu : le tableau reste la version exacte de la courbe, repliée ou non. */}
        <Collapse in={detail} id="tableau-ca"><Table size="small" aria-label="Projection mensuelle exacte en euros" sx={TABLEAU}>
          <TableHead><TableRow>{["Mois", "Signé", "Probable", "Optimiste"].map((s) => <TableCell key={s}>{s}</TableCell>)}</TableRow></TableHead>
          <TableBody>{courbe.map((m) => <TableRow key={m.mois} data-mois={m.mois} data-signe={m.signe} data-pondere={m.pondere} data-optimiste={m.optimiste}>
            <TableCell component="th" scope="row">{moisLong(m.mois)}</TableCell>{[m.signe, m.pondere, m.optimiste].map((v, i) => <TableCell key={i}>{eurosPrecis(v)}</TableCell>)}
          </TableRow>)}</TableBody>
        </Table></Collapse>
      </Bloc>
      {d.contratsASaisir.length > 0 && <Bloc icone={IconFilePencil} teinte="orange" titre="Contrats à saisir" nombre={`${d.contratsASaisir.length} · estimés, jamais comptés dans le signé`}>
        {d.contratsASaisir.map((c) => <Stack key={c.organisationId} direction="row" flexWrap="wrap" useFlexGap columnGap={1.75} rowGap={0.25} alignItems="baseline"
          data-contrat-a-saisir={c.organisationId} data-centimes={c.centimes} sx={{ px: 2.5, py: 1.25, borderTop: `1px solid ${JETONS.filetInterne}` }}>
          <Typography component={Link} prefetch={false} href={`/pilot/organisations/${c.organisationId}?onglet=argent`} fontWeight={500} sx={{ flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere" }}>{c.nom}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ flex: "0 1 auto" }}>{LIBELLES[c.etape]}</Typography>
          <Typography fontWeight={500} sx={{ flex: "0 0 auto", minWidth: 110, textAlign: "right" }}>{c.centimes > 0 ? `${eurosPrecis(c.centimes)} / mois` : "Sans estimation"}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ flexBasis: "100%" }}>{c.centimes > 0 ? `Estimé ${c.origine}.` : "Rien pour l'estimer : saisissez le contrat."}</Typography>
        </Stack>)}
      </Bloc>}
      <Bloc icone={IconTarget} teinte="bleu" titre="Opportunités ouvertes" nombre={`${d.opportunites.length} · cochez pour compter, décalez le démarrage`} lien="/pilot/pipeline" action="Voir les prospects"
        vide={!groupes.length && "Aucune opportunité ouverte. Vous pouvez en créer depuis une fiche."}>
        {groupes.map((groupe) => <Box key={groupe[0].organisationId}>
          <Typography variant="subtitle2" sx={{ px: 2.5, pt: 1.5, pb: 0.5, borderTop: `1px solid ${JETONS.filetInterne}` }}>{groupe[0].organisationNom}</Typography>
          {groupe.map((o) => {
            const c = choix.find((c) => c.opportuniteId === o.id)!;
            const exclue = o.categoriePrevision === "EXCLU";
            const libelle = o.libelle || o.produit;
            const debut = c.demarrageDecaleLe ?? o.demarrageAttenduLe;
            const decalage = o.demarrageAttenduLe && debut ? ecartMois(o.demarrageAttenduLe, debut) : 0;
            const description = debut ? `${moisLong(debut)}${decalage > 0 ? `, décalé de ${compter(decalage, "mois", "mois")}` : decalage < 0 ? `, avancé de ${compter(-decalage, "mois", "mois")}` : ""}` : "";
            return <Stack key={o.id} direction="row" flexWrap="wrap" useFlexGap columnGap={1.75} rowGap={0.5} alignItems="center" sx={{ px: 2.5, py: 1.25, borderTop: `1px solid ${JETONS.filetInterne}`, opacity: exclue ? 0.55 : 1 }}>
              <Checkbox checked={c.cochee && !exclue} disabled={exclue} onChange={(e) => modifier(o.id, { cochee: e.target.checked })}
                inputProps={{ "aria-label": `Compter ${libelle} dans la projection` }} sx={{ ml: -0.75, p: 0.5 }} />
              <Typography fontWeight={500} sx={{ flex: "1 1 180px", minWidth: 0 }}>{libelle}</Typography>
              <Typography fontWeight={500} sx={{ width: 110, textAlign: "right" }}>{eurosPrecis(o.montantMensuelCentimes)}</Typography>
              <Box sx={{ width: 130 }}><Typography variant="body2">{o.probabiliteForcee ? o.probabilite : PROBABILITE_PAR_ETAPE[o.etape]} %</Typography>
                <Typography variant="caption" color="text.secondary" display="block">{o.probabiliteForcee ? "corrigée à la main" : "selon l'étape"}</Typography></Box>
              <Box sx={{ width: 90 }}><Chip label={LIBELLES_PREVISION[o.categoriePrevision]} /></Box>
              <Box sx={{ flex: "1 1 280px", minWidth: 0 }}>
                {exclue ? <Typography variant="body2" color="text.secondary">Exclu de la prévision.</Typography> :
                  !o.demarrageAttenduLe ? <Typography variant="body2" color="text.secondary">Sans date de démarrage : hors projection. <Button size="small" component={Link} prefetch={false} href={`/pilot/organisations/${o.organisationId}?onglet=argent`}>Renseigner le démarrage</Button></Typography> :
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Slider size="small" min={-6} max={12} step={1} value={decalage}
                      aria-label={`Décaler le démarrage de ${libelle}`} aria-describedby={`debut-${o.id}`} getAriaValueText={() => description}
                      valueLabelDisplay="auto" valueLabelFormat={(n) => n === 0 ? "Date attendue" : n > 0 ? `${compter(n, "mois", "mois")} plus tard` : `${compter(-n, "mois", "mois")} plus tôt`}
                      onChange={(_, valeur) => { const n = Number(valeur); modifier(o.id, { demarrageDecaleLe: n === 0 ? null : decalerMois(new Date(o.demarrageAttenduLe!), n).toISOString() }); }} />
                    <Typography variant="caption" color="text.secondary" id={`debut-${o.id}`} sx={{ width: 130, flexShrink: 0 }}>{description}</Typography>
                  </Stack>}
              </Box>
              {c.demarrageDecaleLe && <Button size="small" onClick={() => modifier(o.id, { demarrageDecaleLe: null })}>Rétablir</Button>}
            </Stack>;
          })}
        </Box>)}
      </Bloc>
    </>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2.5, alignItems: "start" }}>
      <Bloc icone={IconScale} teinte="indigo" titre="Réel et prévision" nombre="le réel se fige le 1er de chaque mois">
        {!comparaison.length ? <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 2.5 }}>Aucun mois figé. Le premier sera figé le 1er {moisLong(decalerMois(new Date(moisDepart), 1).toISOString())}.</Typography> : <>
          <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 1 }}>{scenario ? `Scénario « ${scenario.nom} », montants probables.` : "Sans scénario, montants probables."} Le facturé compte les abonnements, la part à l&apos;usage et les installations du mois. La projection est rejouée sur l&apos;état actuel des contrats et des opportunités, pas sur celui de l&apos;époque.</Typography>
          <Table size="small" aria-label="Chiffre clôturé et prévision, mois par mois" sx={TABLEAU}>
            <TableHead><TableRow>{["Mois", "Facturé, mois figé", "Projection", "Écart", "Écart en %"].map((s) => <TableCell key={s}>{s}</TableCell>)}</TableRow></TableHead>
            <TableBody>{comparaison.map((m) => <TableRow key={m.mois} data-reel-mois={m.mois} data-reel={m.reel} data-projete={m.projete} data-ecart={m.ecart}>
              <TableCell component="th" scope="row">{moisLong(m.mois)}</TableCell>
              <TableCell>{eurosPrecis(m.reel)}</TableCell><TableCell>{eurosPrecis(m.projete)}</TableCell>
              <TableCell sx={{ color: m.ecart > 0 ? "success.main" : m.ecart < 0 ? "error.main" : undefined }}>{signe(m.ecart)}</TableCell>
              <TableCell sx={{ color: m.ecart > 0 ? "success.main" : m.ecart < 0 ? "error.main" : undefined }}>{m.ecartPourMille === null ? "Sans projection ce mois" : pourcentage(m.ecartPourMille)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </>}
      </Bloc>
      <Bloc icone={IconFileSpreadsheet} teinte="vert" titre="Export pour la comptabilité">
        <Stack spacing={1.5} sx={{ px: 2.5, pb: 2.5 }}>
          {!MODELE_TARIFAIRE_VALIDE && <Alert severity="warning" icon={false}>{AVERTISSEMENT_EXPORT}</Alert>}
          {!peutExporter ? <Typography variant="body2" color="text.secondary">Le droit « Exporter pour la comptabilité » ne vous a pas été donné. Le super-administrateur peut vous l&apos;ouvrir depuis l&apos;écran Équipe.</Typography> : <>
            <Typography variant="body2" color="text.secondary">Le fichier reprend les mois figés, une ligne par client, produit et centre.</Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.25} alignItems="center">
              <TextField type="month" label="Du mois" value={periode.de} InputLabelProps={{ shrink: true }} onChange={(e) => setPeriode((p) => ({ ...p, de: e.target.value }))} />
              <TextField type="month" label="Au mois" value={periode.a} InputLabelProps={{ shrink: true }} onChange={(e) => setPeriode((p) => ({ ...p, a: e.target.value }))} />
              <Button variant="outlined" component="a" disabled={erreurPeriode !== null}
                href={`/api/pilot/ca/export.csv?de=${encodeURIComponent(periode.de)}&a=${encodeURIComponent(periode.a)}`}>Exporter pour la comptabilité</Button>
            </Stack>
            {erreurPeriode && <Typography role="alert" color="error" variant="body2">{erreurPeriode}</Typography>}
          </>}
        </Stack>
      </Bloc>
    </Box>
    {aCharger && <DialogueFormulaire titre="Abandonner les modifications ?" bouton="Changer de scénario" fermer={() => setACharger(null)}
      soumettre={async () => { charger(aCharger.id); setACharger(null); }}>
      <Typography>Les coches et les décalages en cours ne sont pas enregistrés. Ils seront perdus.</Typography>
    </DialogueFormulaire>}
    {dialogue && <DialogueFormulaire titre={dialogue === "copier" ? "Enregistrer sous" : "Enregistrer le scénario"} fermer={() => setDialogue(null)} soumettre={enregistrer}>
      <TextField autoFocus required name="nom" label="Nom du scénario" defaultValue={dialogue === "enregistrer" ? scenario?.nom ?? "" : ""} inputProps={{ maxLength: 120 }} />
      <TextField name="notes" label="Notes" multiline minRows={3} inputProps={{ maxLength: 5000 }}
        helperText={dialogue === "enregistrer" && scenario ? "Laisser vide pour conserver les notes existantes." : "Facultatives."} />
    </DialogueFormulaire>}
  </Stack>;
}

function Indicateur({ titre, cle, montant, children }: { titre: string; cle: string; montant: number; children: ReactNode }) {
  return <Card sx={{ px: 2.5, py: 2 }}>
    <Typography variant="body2" color="text.secondary">{titre}</Typography>
    <Typography component="p" data-testid={cle} data-centimes={montant} sx={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, my: 0.5 }}>{eurosPrecis(montant)}</Typography>
    <Box sx={{ fontSize: 12, color: "text.secondary" }}>{children}</Box>
  </Card>;
}
