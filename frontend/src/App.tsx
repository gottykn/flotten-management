import React, { useEffect, useState } from "react";

// ---------------------------------------------
// Typen (angepasst an eure FastAPI-Response-Modelle)
// ---------------------------------------------
type StandortTyp = "MIETPARK" | "KUNDE";
type GeraetStatus = "VERFUEGBAR" | "VERMIETET" | "WARTUNG" | "AUSGEMUSTERT";
type VermietStatus = "RESERVIERT" | "OFFEN" | "GESCHLOSSEN" | "STORNIERT";
type SatzEinheit = "TAEGLICH" | "MONATLICH";
type PosTyp = "MONTAGE" | "ERSATZTEIL" | "SERVICEPAUSCHALE" | "VERSICHERUNG" | "SONSTIGES";

// Domänenobjekte
type Geraet = {
  id: number; name: string; kategorie: string; modell?: string; seriennummer?: string;
  status: GeraetStatus; stundenzaehler: number; stunden_pro_tag: number;
  kauf_datum?: string; anschaffungspreis: number; standort_typ: StandortTyp;
  heim_mietpark_id?: number | null; akt_mietpark_id?: number | null; akt_baustelle_id?: number | null;
  eigentuemer_firma_id?: number | null;
};

type Kunde = { id: number; name: string; email?: string; telefon?: string; rechnungsadresse?: string; ust_id?: string };

type Baustelle = { id: number; kunde_id?: number; name: string; adresse?: string; stadt?: string; land?: string };

type Vermietung = {
  id: number; geraet_id: number; kunde_id: number; baustelle_id?: number | null;
  start_datum: string; end_datum?: string | null; satz_wert: number; satz_einheit: SatzEinheit;
  status: VermietStatus; stunden_ist?: number | null; zaehler_start?: number | null; zaehler_ende?: number | null;
  notizen?: string | null;
};

type Position = { id: number; vermietung_id: number; typ: PosTyp; text?: string | null; menge: number; einheit: string; preis_einzel: number; kosten_einzel: number };

type Rechnung = { id: number; vermietung_id: number; nummer: string; datum: string; betrag_netto?: number | null; bezahlt: boolean };

type Abrechnung = { miete: number; positionen_einnahmen: number; einnahmen_gesamt: number; kosten_gesamt: number; marge: number };

type Auslastung = { fenster_start: string; fenster_ende: string; flotte: number; pro_geraet: Record<string, number> };

// ---------------------------------------------
// Fetch-Helper
// ---------------------------------------------
function q(params: Record<string, any>) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    usp.set(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
}

async function apiGet<T>(baseUrl: string, path: string, params: Record<string, any> = {}): Promise<T> {
  const url = `${baseUrl}${path}${q(params)}`;
  console.log(`🔍 GET: ${url}`);
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
    });
    
    console.log(`✅ Response status: ${res.status}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ API Error (${res.status}):`, errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    
    const data = await res.json();
    console.log(`📦 Data received:`, data);
    return data;
  } catch (error) {
    console.error(`❌ Fetch failed for ${url}:`, error);
    throw error;
  }
}

async function apiPost<T>(baseUrl: string, path: string, body: any): Promise<T> {
  const url = `${baseUrl}${path}`;
  console.log(`📤 POST: ${url}`, body);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(body ?? {}),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
    });
    
    console.log(`✅ Response status: ${res.status}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ API Error (${res.status}):`, errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    
    const data = await res.json();
    console.log(`📦 Data received:`, data);
    return data;
  } catch (error) {
    console.error(`❌ Post failed for ${url}:`, error);
    throw error;
  }
}


// ---------------------------------------------
// UI Utilities
// ---------------------------------------------
const fmtEUR = (n?: number | null) => typeof n === "number" ? n.toLocaleString("de-DE", { style: "currency", currency: "EUR" }) : "–";
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("de-DE") : "–";

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "yellow" | "red" | "blue" }) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[tone]}`}>{children}</span>;
}

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-3">{children}</div>;
}

function Button({ children, onClick, variant = "primary", type = "button", disabled }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "outline"; type?: "button" | "submit"; disabled?: boolean }) {
  const cls = {
    primary: "bg-black text-white hover:bg-black/90",
    ghost: "text-black hover:bg-black/5",
    outline: "border border-black/10 hover:bg-black/5",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}>
      {children}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`px-3 py-2 rounded-xl border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/20 ${props.className ?? ""}`} />
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`px-3 py-2 rounded-xl border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/20 ${props.className ?? ""}`} />
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`px-3 py-2 rounded-xl border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/20 ${props.className ?? ""}`} />
}

function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-black/10 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-black/60 hover:text-black">✕</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-black/10 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------
// Haupt-App
// ---------------------------------------------
const TABS = ["geraete", "vermietungen", "berichte", "einnahmen", "stammdaten"] as const;
type Tab = typeof TABS[number];

export default function RentalFleetApp() {
  const [baseUrl, setBaseUrl] = useState("https://flotte-api.onrender.com");
  const [tab, setTab] = useState<"geraete" | "vermietungen" | "berichte" | "einnahmen" | "stammdaten">("geraete");
  const [toast, setToast] = useState<string | null>(null);

  // Rechnungssuche
  const [sucheNr, setSucheNr] = useState("");
  const [sucheResult, setSucheResult] = useState<{ rechnung_id: number; vermietung_id: number } | null>(null);

  async function handleRechnungSuche() {
    try {
      if (!sucheNr.trim()) return;
      const data = await apiGet<{ rechnung_id: number; vermietung_id: number }>(baseUrl, "/rechnungen/suche", { nummer: sucheNr.trim() });
      setSucheResult(data);
      setTab("vermietungen");
      setToast(`Gefunden: Vermietung #${data.vermietung_id}`);
    } catch (e: any) {
      setSucheResult(null);
      setToast(`Nicht gefunden: ${sucheNr}`);
    }
  }

  // ganz einfache Dev-„Tests“
  function __runQuickTests() {
    console.assert(q({ a: 1, b: "" }) === "?a=1", "q should drop empty values");
    console.assert(q({}) === "", "q should return empty string for no params");
  }
  try { if ((import.meta as any).env?.DEV) __runQuickTests(); } catch {}

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-black/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-xl text-sm font-medium ${tab === t ? "bg-black text-white" : "hover:bg-black/5"}`}>
                {t === "geraete" ? "Geräte" : t === "vermietungen" ? "Vermietungen" : t === "berichte" ? "Berichte" : t === "einnahmen" ? "Einnahmen" : "Stammdaten"}
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="API-URL" />
            <Input value={sucheNr} onChange={(e) => setSucheNr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRechnungSuche()} placeholder="Rechnungsnummer" />
            <Button onClick={handleRechnungSuche}>Suchen</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {tab === "geraete" && <GeraeteBoard baseUrl={baseUrl} onToast={setToast} />}
        {tab === "vermietungen" && <VermietungenBoard baseUrl={baseUrl} onToast={setToast} anchorVermietungId={sucheResult?.vermietung_id ?? null} />}
        {tab === "berichte" && <BerichteBoard baseUrl={baseUrl} onToast={setToast} />}
        {tab === "einnahmen" && <EinnahmenReport baseUrl={baseUrl} onToast={setToast} />}
        {tab === "stammdaten" && <StammdatenBoard baseUrl={baseUrl} onToast={setToast} />}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white rounded-xl px-4 py-2 shadow" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------
// Geräte-Board
// ---------------------------------------------
function GeraeteBoard({ baseUrl, onToast }: { baseUrl: string; onToast: (s: string | null) => void }) {
  const [status, setStatus] = useState<GeraetStatus | "">("");
  const [standort, setStandort] = useState<StandortTyp | "">("");
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Geraet[]>([]);
  const [loading, setLoading] = useState(false);
  const [select, setSelect] = useState<Geraet | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [baustellen, setBaustellen] = useState<Baustelle[]>([]);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet<Geraet[]>(baseUrl, "/geraete", { status: status || undefined, standort_typ: standort || undefined, limit, offset });
      setItems(data);
    } catch (e: any) {
      onToast?.(`Fehler beim Laden der Geräte: ${e?.message ?? e}`);
      setItems([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [status, standort, limit, offset, baseUrl]);

  // Stammdaten (einmalig Kunden) – für Formulare
  useEffect(() => {
    (async () => {
      try { setKunden(await apiGet<Kunde[]>(baseUrl, "/kunden", { limit: 500 })); } catch {}
    })();
  }, [baseUrl]);

  useEffect(() => {
    if (!select?.id) return;
    (async () => {
      try { setBaustellen(await apiGet<Baustelle[]>(baseUrl, "/baustellen", { limit: 500 })); } catch {}
    })();
  }, [select?.id, baseUrl]);

  return (
    <Section
      title="Geräte"
      actions={
        <Toolbar>
          <Select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as any); }}>
            <option value="">Status: alle</option>
            {(["VERFUEGBAR", "VERMIETET", "WARTUNG", "AUSGEMUSTERT"] as GeraetStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={standort} onChange={(e) => { setOffset(0); setStandort(e.target.value as any); }}>
            <option value="">Standort: alle</option>
            {(["MIETPARK", "KUNDE"] as StandortTyp[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={String(limit)} onChange={(e) => { setOffset(0); setLimit(Number(e.target.value)); }}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>pro Seite: {n}</option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => { setOffset(Math.max(0, offset - limit)); }}>◀</Button>
          <Button variant="outline" onClick={() => { setOffset(offset + limit); }}>▶</Button>
          <Button variant="ghost" onClick={load}>{loading ? "Lädt…" : "Aktualisieren"}</Button>
        </Toolbar>
      }
    >
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Kategorie</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Standort</th>
              <th className="py-2 pr-4">Stunden</th>
              <th className="py-2 pr-4">Anschaffung</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-4">{g.id}</td>
                <td className="py-2 pr-4 font-medium">{g.name}</td>
                <td className="py-2 pr-4">{g.kategorie}</td>
                <td className="py-2 pr-4">
                  {g.status === "VERFUEGBAR" && <Badge tone="green">{g.status}</Badge>}
                  {g.status === "VERMIETET" && <Badge tone="blue">{g.status}</Badge>}
                  {g.status === "WARTUNG" && <Badge tone="yellow">{g.status}</Badge>}
                  {g.status === "AUSGEMUSTERT" && <Badge tone="red">{g.status}</Badge>}
                </td>
                <td className="py-2 pr-4">{g.standort_typ}</td>
                <td className="py-2 pr-4">{g.stundenzaehler.toLocaleString("de-DE")}</td>
                <td className="py-2 pr-4">{fmtEUR(g.anschaffungspreis)}</td>
                <td className="py-2 pr-4 text-right">
                  <Button onClick={() => setSelect(g)}>Vermietung/Reservierung</Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-500">{loading ? "Lädt…" : "Keine Geräte gefunden"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!select} onClose={() => setSelect(null)} title={`Vorgang starten – ${select?.name}`}>
        {select && (
          <StartVorgangForm baseUrl={baseUrl} geraet={select} kunden={kunden} baustellen={baustellen} onDone={(msg) => { onToast(msg); setSelect(null); load(); }} />
        )}
      </Modal>
    </Section>
  );
}

function StartVorgangForm({ baseUrl, geraet, kunden, baustellen, onDone }: { baseUrl: string; geraet: Geraet; kunden: Kunde[]; baustellen: Baustelle[]; onDone: (msg: string) => void }) {
  const [status, setStatus] = useState<VermietStatus>("OFFEN");
  const [kundeId, setKundeId] = useState<number>(kunden[0]?.id ?? 0);
  const [baustelleId, setBaustelleId] = useState<number | "">("");
  const [start, setStart] = useState<string>(new Date().toISOString().slice(0, 10));
  const [ende, setEnde] = useState<string>("");
  const [satzWert, setSatzWert] = useState<number>(0);
  const [satzEinheit, setSatzEinheit] = useState<SatzEinheit>("TAEGLICH");
  const [zaehlerStart, setZaehlerStart] = useState<string>(String(geraet.stundenzaehler));
  const [notizen, setNotizen] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const payload: any = {
        geraet_id: geraet.id,
        kunde_id: Number(kundeId),
        start_datum: start,
        end_datum: ende || null,
        satz_wert: Number(satzWert),
        satz_einheit: satzEinheit,
        zaehler_start: status === "RESERVIERT" ? null : Number(zaehlerStart),
        baustelle_id: baustelleId === "" ? null : Number(baustelleId),
        notizen,
        status,
      };
      const res = await apiPost<{ id: number }>(baseUrl, "/vermietungen", payload);
      onDone(`${status === "RESERVIERT" ? "Reservierung" : "Vermietung"} #${res.id} angelegt`);
    } catch (e: any) {
      onDone(`Fehler: ${e.message}`);
    } finally { setBusy(false); }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Status</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value as VermietStatus)}>
            <option value="OFFEN">OFFEN (sofort starten)</option>
            <option value="RESERVIERT">RESERVIERT (später starten)</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Kunde</span>
          <Select value={String(kundeId)} onChange={(e) => setKundeId(Number(e.target.value))}>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Baustelle (optional)</span>
          <Select value={String(baustelleId)} onChange={(e) => setBaustelleId(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">– keine –</option>
            {baustellen.filter((b) => b.kunde_id === kundeId || b.kunde_id === undefined || b.kunde_id === null).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Startdatum</span>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Enddatum (optional)</span>
          <Input type="date" value={ende} onChange={(e) => setEnde(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Satz</span>
          <div className="flex gap-2">
            <Input type="number" step="0.01" value={String(satzWert)} onChange={(e) => setSatzWert(Number(e.target.value))} className="flex-1" />
            <Select value={satzEinheit} onChange={(e) => setSatzEinheit(e.target.value as SatzEinheit)}>
              <option value="TAEGLICH">täglich</option>
              <option value="MONATLICH">monatlich</option>
            </Select>
          </div>
        </label>
        {status !== "RESERVIERT" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Zähler Start</span>
            <Input type="number" step="0.01" value={zaehlerStart} onChange={(e) => setZaehlerStart(e.target.value)} />
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Notizen</span>
        <TextArea rows={3} value={notizen} onChange={(e) => setNotizen(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" variant="primary">{busy ? "Speichere…" : "Anlegen"}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------
// Vermietungen-Board
// ---------------------------------------------
function VermietungenBoard({ baseUrl, onToast, anchorVermietungId }: { baseUrl: string; onToast: (s: string | null) => void; anchorVermietungId?: number | null }) {
  const [status, setStatus] = useState<VermietStatus | "">("");
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Vermietung[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Vermietung | null>(null);
  const [geraeteCache, setGeraeteCache] = useState<Record<number, Geraet>>({});
  const [kundenCache, setKundenCache] = useState<Record<number, Kunde>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet<Vermietung[]>(baseUrl, "/vermietungen", { status: status || undefined, limit, offset });
      setItems(data);
      if (anchorVermietungId) {
        const hit = data.find((v) => v.id === anchorVermietungId);
        if (hit) setDetail(hit);
      }
    } catch (e: any) {
      onToast?.(`Fehler beim Laden der Vermietungen: ${e?.message ?? e}`);
      setItems([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [status, limit, offset, baseUrl]);
  useEffect(() => { if (anchorVermietungId) load(); }, [anchorVermietungId]);

  async function resolveGeraet(id: number) {
    if (geraeteCache[id]) return geraeteCache[id];
    const g = await apiGet<Geraet>(baseUrl, `/geraete/${id}`);
    setGeraeteCache((prev) => ({ ...prev, [id]: g }));
    return g;
  }
  async function resolveKunde(id: number) {
    if (kundenCache[id]) return kundenCache[id];
    const ks = await apiGet<Kunde[]>(baseUrl, "/kunden", { limit: 500 });
    const hit = ks.find((k) => k.id === id);
    if (hit) setKundenCache((prev) => ({ ...prev, [id]: hit }));
    return hit as Kunde | undefined;
  }

  return (
    <Section
      title="Vermietungen"
      actions={
        <Toolbar>
          <Select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as any); }}>
            <option value="">Status: alle</option>
            {(["RESERVIERT", "OFFEN", "GESCHLOSSEN", "STORNIERT"] as VermietStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={String(limit)} onChange={(e) => { setOffset(0); setLimit(Number(e.target.value)); }}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>pro Seite: {n}</option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => { setOffset(Math.max(0, offset - limit)); }}>◀</Button>
          <Button variant="outline" onClick={() => { setOffset(offset + limit); }}>▶</Button>
          <Button variant="ghost" onClick={load}>{loading ? "Lädt…" : "Aktualisieren"}</Button>
        </Toolbar>
      }
    >
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Gerät</th>
              <th className="py-2 pr-4">Kunde</th>
              <th className="py-2 pr-4">Zeitraum</th>
              <th className="py-2 pr-4">Satz</th>
              <th className="py-2 pr-4">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-4">{v.id}</td>
                <td className="py-2 pr-4"><AsyncLabel promise={resolveGeraet(v.geraet_id).then((g) => g.name)} /></td>
                <td className="py-2 pr-4"><AsyncLabel promise={resolveKunde(v.kunde_id).then((k) => (k?.name ?? `Kunde ${v.kunde_id}`))} /></td>
                <td className="py-2 pr-4">{fmtDate(v.start_datum)} – {fmtDate(v.end_datum)}</td>
                <td className="py-2 pr-4">{fmtEUR(v.satz_wert)} / {v.satz_einheit === "TAEGLICH" ? "Tag" : "Monat"}</td>
                <td className="py-2 pr-4">
                  {v.status === "OFFEN" && <Badge tone="blue">OFFEN</Badge>}
                  {v.status === "RESERVIERT" && <Badge tone="yellow">RESERVIERT</Badge>}
                  {v.status === "GESCHLOSSEN" && <Badge tone="slate">GESCHLOSSEN</Badge>}
                  {v.status === "STORNIERT" && <Badge tone="red">STORNIERT</Badge>}
                </td>
                <td className="py-2 pr-4 text-right"><Button onClick={() => setDetail(v)}>Details</Button></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500">{loading ? "Lädt…" : "Keine Vermietungen gefunden"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Vermietung #${detail?.id}`}>
        {detail && (
          <VermietungDetail baseUrl={baseUrl} vermietung={detail} onChanged={(v) => setDetail(v)} onToast={onToast} />
        )}
      </Modal>
    </Section>
  );
}

function AsyncLabel({ promise }: { promise: Promise<string> }) {
  const [txt, setTxt] = useState<string>("…");
  useEffect(() => { let alive = true; promise.then((t) => alive && setTxt(t)).catch(() => alive && setTxt("–")); return () => { alive = false; }; }, [promise]);
  return <span>{txt}</span>;
}

function VermietungDetail({ baseUrl, vermietung, onChanged, onToast }: { baseUrl: string; vermietung: Vermietung; onChanged: (v: Vermietung) => void; onToast: (s: string | null) => void }) {
  const [abr, setAbr] = useState<Abrechnung | null>(null);
  const [pos, setPos] = useState<Position[]>([]);
  const [rc, setRc] = useState<Rechnung[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    try {
      const [ab, ps, rs] = await Promise.all([
        apiGet<Abrechnung>(baseUrl, `/berichte/vermietungen/${vermietung.id}/abrechnung`).catch(() => null as any),
        apiGet<Position[]>(baseUrl, `/vermietungen/${vermietung.id}/positionen`, { limit: 500 }).catch(() => []),
        apiGet<Rechnung[]>(baseUrl, `/vermietungen/${vermietung.id}/rechnungen`, { limit: 500 }).catch(() => []),
      ]);
      setAbr(ab);
      setPos(ps);
      setRc(rs);
    } catch {}
  }

  useEffect(() => { loadAll(); }, [vermietung.id, baseUrl]);

  async function closeRental() {
    const end_datum = new Date().toISOString().slice(0, 10);
    const stunden_ist = prompt("Stunden (Ist) bei Rückgabe? Wenn Zähler vorhanden, leer lassen.");
    setBusy(true);
    try {
      const v = await apiPost<Vermietung>(baseUrl, `/vermietungen/${vermietung.id}/schliessen`, {
        end_datum,
        stunden_ist: stunden_ist ? Number(stunden_ist) : undefined,
      });
      onChanged(v); onToast("Vermietung geschlossen");
      await loadAll();
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setBusy(false); }
  }

  async function startReservation() {
    const start_datum = prompt("Startdatum (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!start_datum) return;
    const zaehler_start = prompt("Zähler Start (leer = Gerätewert)") ?? "";
    setBusy(true);
    try {
      const v = await apiPost<Vermietung>(baseUrl, `/vermietungen/${vermietung.id}/starten`, {
        start_datum,
        zaehler_start: zaehler_start.trim() === "" ? undefined : Number(zaehler_start),
      });
      onChanged(v); onToast("Reservierung gestartet");
      await loadAll();
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setBusy(false); }
  }

  async function addPosition() {
    const typ = prompt("Positionstyp (MONTAGE, ERSATZTEIL, SERVICEPAUSCHALE, VERSICHERUNG, SONSTIGES)", "MONTAGE") as PosTyp;
    if (!typ) return;
    const menge = Number(prompt("Menge", "1") || "1");
    const preis = Number(prompt("Preis (VK)", "0") || "0");
    const kosten = Number(prompt("Interne Kosten", "0") || "0");
    const text = prompt("Text (optional)") ?? undefined;
    setBusy(true);
    try {
      await apiPost<{ id: number }>(baseUrl, `/vermietungen/${vermietung.id}/positionen`, { typ, menge, preis_einzel: preis, kosten_einzel: kosten, text });
      await loadAll();
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setBusy(false); }
  }

  async function addRechnung() {
    const nummer = prompt("Rechnungsnummer")?.trim();
    if (!nummer) return;
    setBusy(true);
    try {
      await apiPost<{ id: number }>(baseUrl, `/vermietungen/${vermietung.id}/rechnungen`, { nummer });
      await loadAll();
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={vermietung.status === "OFFEN" ? "blue" : vermietung.status === "RESERVIERT" ? "yellow" : vermietung.status === "GESCHLOSSEN" ? "slate" : "red"}>{vermietung.status}</Badge>
        <div className="text-slate-500">{fmtDate(vermietung.start_datum)} – {fmtDate(vermietung.end_datum)}</div>
        <div className="text-slate-500">Satz: {fmtEUR(vermietung.satz_wert)} / {vermietung.satz_einheit === "TAEGLICH" ? "Tag" : "Monat"}</div>
      </div>

      <Section title="Abrechnung">
        {abr ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <InfoTile label="Miete" value={fmtEUR(abr.miete)} />
            <InfoTile label="Positionen (VK)" value={fmtEUR(abr.positionen_einnahmen)} />
            <InfoTile label="Einnahmen gesamt" value={fmtEUR(abr.einnahmen_gesamt)} />
            <InfoTile label="Interne Kosten" value={fmtEUR(abr.kosten_gesamt)} />
            <InfoTile label="Marge" value={fmtEUR(abr.marge)} highlight />
          </div>
        ) : (
          <div className="text-slate-500 text-sm">Noch keine Abrechnung (evtl. Vermietung offen?)</div>
        )}
      </Section>

      <Section title="Positionen" actions={<Button onClick={addPosition}>+ Position</Button>}>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Typ</th>
                <th className="py-2 pr-4">Text</th>
                <th className="py-2 pr-4">Menge</th>
                <th className="py-2 pr-4">Preis</th>
                <th className="py-2 pr-4">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-medium">{p.typ}</td>
                  <td className="py-2 pr-4">{p.text ?? "–"}</td>
                  <td className="py-2 pr-4">{p.menge}</td>
                  <td className="py-2 pr-4">{fmtEUR(p.preis_einzel)}</td>
                  <td className="py-2 pr-4">{fmtEUR(p.kosten_einzel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Rechnungen" actions={<Button onClick={addRechnung}>+ Rechnung</Button>}>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Nummer</th>
                <th className="py-2 pr-4">Datum</th>
                <th className="py-2 pr-4">Betrag (optional)</th>
                <th className="py-2 pr-4">Bezahlt</th>
              </tr>
            </thead>
            <tbody>
              {rc.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-medium">{r.nummer}</td>
                  <td className="py-2 pr-4">{fmtDate(r.datum)}</td>
                  <td className="py-2 pr-4">{fmtEUR(r.betrag_netto ?? undefined)}</td>
                  <td className="py-2 pr-4">{r.bezahlt ? "ja" : "nein"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="flex justify-end gap-2">
        {vermietung.status === "RESERVIERT" && <Button onClick={startReservation}>Reservierung starten</Button>}
        {vermietung.status === "OFFEN" && <Button onClick={closeRental}>{busy ? "Schließe…" : "Rückgabe / schließen"}</Button>}
      </div>
    </div>
  );
}

function InfoTile({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border text-sm ${highlight ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="text-slate-500">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

// ---------------------------------------------
// Berichte – Auslastung
// ---------------------------------------------
function BerichteBoard({ baseUrl, onToast }: { baseUrl: string; onToast: (s: string | null) => void }) {
  const today = new Date();
  const d30 = new Date(today.getTime() - 29 * 86400000);
  const [start, setStart] = useState<string>(d30.toISOString().slice(0, 10));
  const [ende, setEnde] = useState<string>(today.toISOString().slice(0, 10));
  const [data, setData] = useState<Auslastung | null>(null);
  const [loading, setLoading] = useState(false);

  async function calc() {
    setLoading(true);
    try {
      const res = await apiGet<Auslastung>(baseUrl, "/berichte/auslastung", { fenster_start: start, fenster_ende: ende });
      setData(res);
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setLoading(false); }
  }

  useEffect(() => { calc(); }, [baseUrl]);

  return (
    <Section title="Berichte – Auslastung">
      <Toolbar>
        <label className="text-sm text-slate-600">Von</label>
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <label className="text-sm text-slate-600">Bis</label>
        <Input type="date" value={ende} onChange={(e) => setEnde(e.target.value)} />
        <Button onClick={calc}>{loading ? "Berechne…" : "Berechnen"}</Button>
      </Toolbar>

      {data ? (
        <div className="space-y-4">
          <div className="text-sm">Flotten-Auslastung gesamt: <span className="font-semibold">{(data.flotte * 100).toFixed(1)}%</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(data.pro_geraet).map(([gid, u]) => (
              <div key={gid} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                <div className="text-sm text-slate-600">Gerät #{gid}</div>
                <div className="text-base font-semibold">{(u * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">Noch keine Daten</div>
      )}
    </Section>
  );
}

// ---------------------------------------------
// Einnahmen Report (clientseitige Aggregation)
// ---------------------------------------------
function EinnahmenReport({ baseUrl, onToast }: { baseUrl: string; onToast: (s: string | null) => void }) {
  const today = new Date();
  const d30 = new Date(today.getTime() - 29 * 86400000);
  const [start, setStart] = useState<string>(d30.toISOString().slice(0, 10));
  const [ende, setEnde] = useState<string>(today.toISOString().slice(0, 10));
  const [status, setStatus] = useState<"" | "GESCHLOSSEN" | "OFFEN">("GESCHLOSSEN");
  const [limit, setLimit] = useState<number>(100);
  const [rows, setRows] = useState<(Abrechnung & { id: number })[]>([]);
  const [tot, setTot] = useState<{ miete: number; pos: number; einnahmen: number; kosten: number; marge: number }>({ miete: 0, pos: 0, einnahmen: 0, kosten: 0, marge: 0 });
  const [loading, setLoading] = useState(false);

  function overlaps(aStart: string, aEnd: string | null | undefined, bStart: string, bEnd: string) {
    const A1 = new Date(aStart).getTime();
    const A2 = (aEnd ? new Date(aEnd) : new Date()).getTime();
    const B1 = new Date(bStart).getTime();
    const B2 = new Date(bEnd).getTime();
    return A1 <= B2 && A2 >= B1;
  }

  async function calc() {
    setLoading(true);
    try {
      const list = await apiGet<Vermietung[]>(baseUrl, "/vermietungen", { status: status || undefined, limit, offset: 0 });
      const sel = list.filter((v) => overlaps(v.start_datum, v.end_datum ?? undefined, start, ende));
      const abrs = await Promise.all(sel.map((v) => apiGet<Abrechnung>(baseUrl, `/berichte/vermietungen/${v.id}/abrechnung`).then((a) => ({ id: v.id, ...a })).catch(() => null)));
      const rowsOk = abrs.filter(Boolean) as (Abrechnung & { id: number })[];
      const t = rowsOk.reduce((acc, r) => ({
        miete: acc.miete + r.miete,
        pos: acc.pos + r.positionen_einnahmen,
        einnahmen: acc.einnahmen + r.einnahmen_gesamt,
        kosten: acc.kosten + r.kosten_gesamt,
        marge: acc.marge + r.marge,
      }), { miete: 0, pos: 0, einnahmen: 0, kosten: 0, marge: 0 });
      setTot(t); setRows(rowsOk);
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setLoading(false); }
  }

  return (
    <Section title="Einnahmenaufstellung (Zeitraum)">
      <Toolbar>
        <label className="text-sm text-slate-600">Von</label>
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <label className="text-sm text-slate-600">Bis</label>
        <Input type="date" value={ende} onChange={(e) => setEnde(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="GESCHLOSSEN">nur geschlossene</option>
          <option value="OFFEN">nur offene</option>
          <option value="">alle</option>
        </Select>
        <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
          {[50, 100, 200, 500].map((n) => <option key={n} value={n}>max. Vermietungen: {n}</option>)}
        </Select>
        <Button onClick={calc}>{loading ? "Berechne…" : "Berechnen"}</Button>
      </Toolbar>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
        <InfoTile label="Miete" value={fmtEUR(tot.miete)} />
        <InfoTile label="Positionen (VK)" value={fmtEUR(tot.pos)} />
        <InfoTile label="Einnahmen gesamt" value={fmtEUR(tot.einnahmen)} />
        <InfoTile label="Kosten gesamt" value={fmtEUR(tot.kosten)} />
        <InfoTile label="Marge gesamt" value={fmtEUR(tot.marge)} highlight />
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-4">Vermietung</th>
              <th className="py-2 pr-4">Miete</th>
              <th className="py-2 pr-4">Positionen</th>
              <th className="py-2 pr-4">Einnahmen</th>
              <th className="py-2 pr-4">Kosten</th>
              <th className="py-2 pr-4">Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2 pr-4">#{r.id}</td>
                <td className="py-2 pr-4">{fmtEUR(r.miete)}</td>
                <td className="py-2 pr-4">{fmtEUR(r.positionen_einnahmen)}</td>
                <td className="py-2 pr-4">{fmtEUR(r.einnahmen_gesamt)}</td>
                <td className="py-2 pr-4">{fmtEUR(r.kosten_gesamt)}</td>
                <td className="py-2 pr-4">{fmtEUR(r.marge)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-500">Noch nichts berechnet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------
// Stammdaten (Gerät / Kunde / Baustelle)
// ---------------------------------------------
function StammdatenBoard({ baseUrl, onToast }: { baseUrl: string; onToast: (s: string | null) => void }) {
  // Gerät
  const [gName, setGName] = useState("");
  const [gKat, setGKat] = useState("");
  const [gMod, setGMod] = useState("");
  const [gSN, setGSN] = useState("");
  const [gStd, setGStd] = useState("0");
  const [gSPT, setGSPT] = useState("8");
  const [gAnsch, setGAnsch] = useState("0");
  const [gKauf, setGKauf] = useState<string>("");
  const [busyG, setBusyG] = useState(false);

  async function saveGeraet() {
    setBusyG(true);
    try {
      await apiPost<{ id: number }>(baseUrl, "/geraete", {
        name: gName.trim(), kategorie: gKat.trim(), modell: gMod || undefined, seriennummer: gSN || undefined,
        stundenzaehler: Number(gStd || 0), stunden_pro_tag: Number(gSPT || 8), anschaffungspreis: Number(gAnsch || 0),
        kauf_datum: gKauf || undefined,
      });
      onToast("Gerät angelegt");
      setGName(""); setGKat(""); setGMod(""); setGSN(""); setGStd("0"); setGSPT("8"); setGAnsch("0"); setGKauf("");
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setBusyG(false); }
  }

  // Kunde
  const [kName, setKName] = useState("");
  const [kMail, setKMail] = useState("");
  const [kTel, setKTel] = useState("");
  const [kAdr, setKAdr] = useState("");
  const [kUst, setKUst] = useState("");
  const [busyK, setBusyK] = useState(false);

  async function saveKunde() {
    setBusyK(true);
    try {
      await apiPost<{ id: number }>(baseUrl, "/kunden", { name: kName.trim(), email: kMail || undefined, telefon: kTel || undefined, rechnungsadresse: kAdr || undefined, ust_id: kUst || undefined });
      onToast("Kunde angelegt");
      setKName(""); setKMail(""); setKTel(""); setKAdr(""); setKUst("");
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setBusyK(false); }
  }

  // Baustelle
  const [kunden, setKunden] = useState<Kunde[]>([]);
  useEffect(() => { apiGet<Kunde[]>(baseUrl, "/kunden", { limit: 500 }).then(setKunden).catch(() => {}); }, [baseUrl]);
  const [bKundeId, setBKundeId] = useState<string>("");
  const [bName, setBName] = useState("");
  const [bAdr, setBAdr] = useState("");
  const [bStadt, setBStadt] = useState("");
  const [bLand, setBLand] = useState("");
  const [busyB, setBusyB] = useState(false);

  async function saveBaustelle() {
    setBusyB(true);
    try {
      await apiPost<{ id: number }>(baseUrl, "/baustellen", { kunde_id: Number(bKundeId), name: bName.trim(), adresse: bAdr || undefined, stadt: bStadt || undefined, land: bLand || undefined });
      onToast("Baustelle angelegt");
      setBKundeId(""); setBName(""); setBAdr(""); setBStadt(""); setBLand("");
    } catch (e: any) { onToast(`Fehler: ${e.message}`); } finally { setBusyB(false); }
  }

  return (
    <div className="space-y-6">
      <Section title="Neues Gerät">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Name *</span><Input value={gName} onChange={(e) => setGName(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Kategorie *</span><Input value={gKat} onChange={(e) => setGKat(e.target.value)} placeholder="z.B. Bohrgerät" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Modell</span><Input value={gMod} onChange={(e) => setGMod(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Seriennummer</span><Input value={gSN} onChange={(e) => setGSN(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Stundenzähler</span><Input type="number" step="0.01" value={gStd} onChange={(e) => setGStd(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Stunden/Tag</span><Input type="number" value={gSPT} onChange={(e) => setGSPT(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Anschaffungspreis</span><Input type="number" step="0.01" value={gAnsch} onChange={(e) => setGAnsch(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">Kaufdatum</span><Input type="date" value={gKauf} onChange={(e) => setGKauf(e.target.value)} /></label>
        </div>
        <div className="flex justify-end mt-3"><Button onClick={saveGeraet}>{busyG ? "Speichere…" : "Gerät anlegen"}</Button></div>
      </Section>

      <Section title="Neuer Kunde">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Name *</span>
            <Input value={kName} onChange={(e) => setKName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">E‑Mail</span>
            <Input type="email" value={kMail} onChange={(e) => setKMail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Telefon</span>
            <Input value={kTel} onChange={(e) => setKTel(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-slate-500">Rechnungsadresse</span>
            <Input value={kAdr} onChange={(e) => setKAdr(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">USt‑ID</span>
            <Input value={kUst} onChange={(e) => setKUst(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end mt-3"><Button onClick={saveKunde}>{busyK ? "Speichere…" : "Kunde anlegen"}</Button></div>
      </Section>

      <Section title="Neue Baustelle">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Kunde *</span>
            <Select value={bKundeId} onChange={(e) => setBKundeId(e.target.value)}>
              <option value="">– auswählen –</option>
              {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Name *</span>
            <Input value={bName} onChange={(e) => setBName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-slate-500">Adresse</span>
            <Input value={bAdr} onChange={(e) => setBAdr(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Stadt</span>
            <Input value={bStadt} onChange={(e) => setBStadt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Land</span>
            <Input value={bLand} onChange={(e) => setBLand(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end mt-3"><Button onClick={saveBaustelle} disabled={!bKundeId}>{busyB ? "Speichere…" : "Baustelle anlegen"}</Button></div>
      </Section>
    </div>
  );
}
