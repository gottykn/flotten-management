# api_v3_de.py - FINALE RENDER.COM-LÖSUNG (VOLLSTÄNDIG)
from datetime import date, datetime
from typing import Optional, List, Dict

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import Response, PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from sqlalchemy import select

from flotte_v3_de import (
    SessionLocal, init_db,
    # Enums
    GeraetStatus, StandortTyp, SatzEinheit, VermietStatus, PosTyp,
    # Funktionen
    mietpark_anlegen, firma_anlegen, geraet_anlegen, kunde_anlegen, baustelle_anlegen,
    vermietung_anlegen, reservierung_starten, vermietung_schliessen, wartung_hinzufuegen,
    position_hinzufuegen, rechnung_hinzufuegen,
    vermietung_abrechnung, geraet_finanz_uebersicht, flotten_auslastung_iststunden,
    # Modelle
    Geraet, Kunde, Mietpark, Baustelle, Vermietung, VermietungPosition, Rechnung, Firma
)

# -----------------------------------------------------------------------------
# App & OpenAPI
# -----------------------------------------------------------------------------
app = FastAPI(title="Flotten-Management API (DE)", version="0.5.0")

# OpenAPI stabil cachen (verhindert endlose Generierung)
_openapi_cache = None
def _custom_openapi():
    global _openapi_cache
    if _openapi_cache:
        return _openapi_cache
    _openapi_cache = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )
    return _openapi_cache

try:
    from fastapi.openapi.utils import get_openapi
    app.openapi = _custom_openapi
except ImportError:
    pass  # Fallback falls Import fehlschlägt

# 🚨 CRITICAL: Render.com CORS-Killer
class RenderCORSKiller(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Log für Debugging
        print(f"🔍 Request: {request.method} {request.url} from {request.headers.get('origin', 'unknown')}")
        
        # SOFORTIGE Antwort für alle OPTIONS
        if request.method == "OPTIONS":
            return Response(
                status_code=200,
                headers={
                    "access-control-allow-origin": "*",
                    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
                    "access-control-allow-headers": "*",
                    "access-control-max-age": "86400",
                }
            )
        
        # Normale Requests verarbeiten
        response = await call_next(request)
        
        # CORS-Headers zu JEDER Response hinzufügen
        response.headers["access-control-allow-origin"] = "*"
        response.headers["access-control-allow-methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH"
        response.headers["access-control-allow-headers"] = "*"
        
        print(f"✅ Response: {response.status_code}")
        return response

# Middleware aktivieren
app.add_middleware(RenderCORSKiller)

# DB anlegen (falls nicht vorhanden)
init_db()

# -----------------------------------------------------------------------------
# Schemas
# -----------------------------------------------------------------------------
class IdOut(BaseModel):
    id: int

class RechnungsSucheOut(BaseModel):
    rechnung_id: int
    vermietung_id: int

class MietparkCreate(BaseModel):
    name: str
    adresse: Optional[str] = None

class MietparkOut(BaseModel):
    id: int
    name: str
    adresse: Optional[str] = None

class FirmaCreate(BaseModel):
    name: str
    land: Optional[str] = None

class FirmaOut(BaseModel):
    id: int
    name: str
    land: Optional[str] = None

class GeraetCreate(BaseModel):
    name: str
    kategorie: str
    modell: Optional[str] = None
    seriennummer: Optional[str] = None
    stundenzaehler: float = 0.0
    stunden_pro_tag: int = 8
    kauf_datum: Optional[date] = None
    anschaffungspreis: float = 0.0
    heim_mietpark_id: Optional[int] = None
    akt_mietpark_id: Optional[int] = None
    eigentuemer_firma_id: Optional[int] = None

class GeraetOut(BaseModel):
    id: int
    name: str
    kategorie: str
    modell: Optional[str] = None
    seriennummer: Optional[str] = None
    status: GeraetStatus
    stundenzaehler: float
    stunden_pro_tag: int
    kauf_datum: Optional[date] = None
    anschaffungspreis: float
    standort_typ: StandortTyp
    heim_mietpark_id: Optional[int] = None
    akt_mietpark_id: Optional[int] = None
    akt_baustelle_id: Optional[int] = None
    eigentuemer_firma_id: Optional[int] = None

class KundeCreate(BaseModel):
    name: str
    email: Optional[str] = None
    telefon: Optional[str] = None
    rechnungsadresse: Optional[str] = None
    ust_id: Optional[str] = None

class KundeOut(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    telefon: Optional[str] = None
    rechnungsadresse: Optional[str] = None
    ust_id: Optional[str] = None

class BaustelleCreate(BaseModel):
    kunde_id: int
    name: str
    adresse: Optional[str] = None
    stadt: Optional[str] = None
    land: Optional[str] = None

class BaustelleOut(BaseModel):
    id: int
    kunde_id: Optional[int] = None
    name: str
    adresse: Optional[str] = None
    stadt: Optional[str] = None
    land: Optional[str] = None

class VermietungCreate(BaseModel):
    geraet_id: int
    kunde_id: int
    start_datum: date
    end_datum: Optional[date] = None
    satz_wert: float
    satz_einheit: SatzEinheit = SatzEinheit.TAEGLICH
    zaehler_start: Optional[float] = None
    baustelle_id: Optional[int] = None
    notizen: Optional[str] = None
    status: VermietStatus = VermietStatus.OFFEN  # RESERVIERT möglich

class VermietungStart(BaseModel):
    start_datum: date
    zaehler_start: Optional[float] = None
    baustelle_id: Optional[int] = None

class VermietungClose(BaseModel):
    end_datum: date
    zaehler_ende: Optional[float] = None
    stunden_ist: Optional[float] = None
    rueckgabe_mietpark_id: Optional[int] = None

class VermietungOut(BaseModel):
    id: int
    geraet_id: int
    kunde_id: int
    baustelle_id: Optional[int]
    start_datum: date
    end_datum: Optional[date]
    satz_wert: float
    satz_einheit: SatzEinheit
    status: VermietStatus
    stunden_ist: Optional[float] = None
    zaehler_start: Optional[float] = None
    zaehler_ende: Optional[float] = None
    notizen: Optional[str] = None

class PositionCreate(BaseModel):
    typ: PosTyp
    menge: float = 1.0
    preis_einzel: float = 0.0
    kosten_einzel: float = 0.0
    einheit: str = "STK"
    text: Optional[str] = None

class PositionOut(BaseModel):
    id: int
    vermietung_id: int
    typ: PosTyp
    text: Optional[str]
    menge: float
    einheit: str
    preis_einzel: float
    kosten_einzel: float

class RechnungCreate(BaseModel):
    nummer: str
    datum: Optional[date] = None
    betrag_netto: Optional[float] = None
    bezahlt: bool = False

class RechnungOut(BaseModel):
    id: int
    vermietung_id: int
    nummer: str
    datum: date
    betrag_netto: Optional[float] = None
    bezahlt: bool

class AuslastungOut(BaseModel):
    fenster_start: date
    fenster_ende: date
    flotte: float
    pro_geraet: Dict[str, float]   # JSON-Objekt-Keys müssen Strings sein

class AbrechnungOut(BaseModel):
    miete: float
    positionen_einnahmen: float
    einnahmen_gesamt: float
    kosten_gesamt: float
    marge: float

class GeraetFinanzenOut(BaseModel):
    einnahmen_brutto: float
    kosten_intern: float
    einnahmen_netto: float
    anschaffungspreis: float
    payback_erreicht: Optional[bool] = None
    roi_vs_anschaffung_prozent: Optional[float] = None

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _session():
    return SessionLocal()

def _vm_to_out(v: Vermietung) -> VermietungOut:
    return VermietungOut(
        id=v.id, geraet_id=v.geraet_id, kunde_id=v.kunde_id, baustelle_id=v.baustelle_id,
        start_datum=v.start_datum, end_datum=v.end_datum, satz_wert=v.satz_wert,
        satz_einheit=v.satz_einheit, status=v.status, stunden_ist=v.stunden_ist,
        zaehler_start=v.zaehler_start, zaehler_ende=v.zaehler_ende, notizen=v.notizen
    )

# -----------------------------------------------------------------------------
# Basis
# -----------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat() + "Z", "cors": "enabled"}

# 🔧 BACKUP OPTIONS-HANDLER
@app.options("/{path:path}")
async def catch_all_options(path: str):
    return Response(
        status_code=200,
        headers={
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
            "access-control-allow-headers": "*",
        }
    )

# Debug-Helfer: zeigt OpenAPI oder Traceback im Klartext
@app.get("/_debug/openapi_raw")
def debug_openapi_raw():
    import json, traceback
    try:
        data = app.openapi()
        return PlainTextResponse(json.dumps(data, indent=2), media_type="application/json")
    except Exception:
        return PlainTextResponse("OpenAPI error:\n" + traceback.format_exc(), status_code=500)

# -----------------------------------------------------------------------------
# Mietparks / Firmen
# -----------------------------------------------------------------------------
@app.post("/mietparks", response_model=IdOut)
def api_mietpark_anlegen(payload: MietparkCreate):
    with _session() as s:
        mp = mietpark_anlegen(s, payload.name, payload.adresse)
        return IdOut(id=mp.id)

@app.get("/mietparks", response_model=List[MietparkOut])
def api_mietparks_list(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
    with _session() as s:
        q = select(Mietpark).offset(offset).limit(limit)
        mps = list(s.scalars(q))
        return [MietparkOut(id=m.id, name=m.name, adresse=m.adresse) for m in mps]

@app.post("/firmen", response_model=IdOut)
def api_firma_anlegen(payload: FirmaCreate):
    with _session() as s:
        f = firma_anlegen(s, payload.name, payload.land)
        return IdOut(id=f.id)

@app.get("/firmen", response_model=List[FirmaOut])
def api_firmen_list(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
    with _session() as s:
        q = select(Firma).offset(offset).limit(limit)
        fs = list(s.scalars(q))
        return [FirmaOut(id=f.id, name=f.name, land=f.land) for f in fs]

# -----------------------------------------------------------------------------
# Geräte
# -----------------------------------------------------------------------------
@app.post("/geraete", response_model=IdOut)
def api_geraet_anlegen(payload: GeraetCreate):
    with _session() as s:
        g = geraet_anlegen(
            s, name=payload.name, kategorie=payload.kategorie, modell=payload.modell,
            seriennummer=payload.seriennummer, stundenzaehler=payload.stundenzaehler,
            stunden_pro_tag=payload.stunden_pro_tag, kauf_datum=payload.kauf_datum,
            anschaffungspreis=payload.anschaffungspreis, heim_mietpark_id=payload.heim_mietpark_id,
            akt_mietpark_id=payload.akt_mietpark_id, eigentuemer_firma_id=payload.eigentuemer_firma_id
        )
        return IdOut(id=g.id)

@app.get("/geraete", response_model=List[GeraetOut])
def api_geraete_list(
    status: Optional[GeraetStatus] = Query(default=None),
    standort_typ: Optional[StandortTyp] = Query(default=None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    with _session() as s:
        q = select(Geraet)
        if status:
            q = q.where(Geraet.status == status)
        if standort_typ:
            q = q.where(Geraet.standort_typ == standort_typ)
        q = q.offset(offset).limit(limit)
        gs = list(s.scalars(q))
        out: List[GeraetOut] = []
        for g in gs:
            out.append(GeraetOut(
                id=g.id, name=g.name, kategorie=g.kategorie, modell=g.modell, seriennummer=g.seriennummer,
                status=g.status, stundenzaehler=g.stundenzaehler, stunden_pro_tag=g.stunden_pro_tag,
                kauf_datum=g.kauf_datum, anschaffungspreis=g.anschaffungspreis,
                standort_typ=g.standort_typ, heim_mietpark_id=g.heim_mietpark_id,
                akt_mietpark_id=g.akt_mietpark_id, akt_baustelle_id=g.akt_baustelle_id,
                eigentuemer_firma_id=g.eigentuemer_firma_id
            ))
        return out

@app.get("/geraete/{geraet_id}", response_model=GeraetOut)
def api_geraet_get(geraet_id: int):
    with _session() as s:
        g = s.get(Geraet, geraet_id)
        if not g:
            raise HTTPException(404, "Geraet nicht gefunden")
        return GeraetOut(
            id=g.id, name=g.name, kategorie=g.kategorie, modell=g.modell, seriennummer=g.seriennummer,
            status=g.status, stundenzaehler=g.stundenzaehler, stunden_pro_tag=g.stunden_pro_tag,
            kauf_datum=g.kauf_datum, anschaffungspreis=g.anschaffungspreis,
            standort_typ=g.standort_typ, heim_mietpark_id=g.heim_mietpark_id,
            akt_mietpark_id=g.akt_mietpark_id, akt_baustelle_id=g.akt_baustelle_id,
            eigentuemer_firma_id=g.eigentuemer_firma_id
        )

# -----------------------------------------------------------------------------
# Kunden / Baustellen
# -----------------------------------------------------------------------------
@app.post("/kunden", response_model=IdOut)
def api_kunde_anlegen(payload: KundeCreate):
    with _session() as s:
        k = kunde_anlegen(s, payload.name, payload.email, payload.telefon, payload.rechnungsadresse, payload.ust_id)
        return IdOut(id=k.id)

@app.get("/kunden", response_model=List[KundeOut])
def api_kunden_list(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
    with _session() as s:
        q = select(Kunde).offset(offset).limit(limit)
        ks = list(s.scalars(q))
        return [KundeOut(id=k.id, name=k.name, email=k.email, telefon=k.telefon,
                         rechnungsadresse=k.rechnungsadresse, ust_id=k.ust_id) for k in ks]

@app.post("/baustellen", response_model=IdOut)
def api_baustelle_anlegen(payload: BaustelleCreate):
    with _session() as s:
        b = baustelle_anlegen(s, payload.kunde_id, payload.name, payload.adresse, payload.stadt, payload.land)
        return IdOut(id=b.id)

@app.get("/baustellen", response_model=List[BaustelleOut])
def api_baustellen_list(
    kunde_id: Optional[int] = None,
    limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)
):
    with _session() as s:
        q = select(Baustelle)
        if kunde_id:
            q = q.where(Baustelle.kunde_id == kunde_id)
        q = q.offset(offset).limit(limit)
        bs = list(s.scalars(q))
        return [BaustelleOut(id=b.id, kunde_id=b.kunde_id, name=b.name, adresse=b.adresse, stadt=b.stadt, land=b.land) for b in bs]

# -----------------------------------------------------------------------------
# Vermietungen
# -----------------------------------------------------------------------------
@app.post("/vermietungen", response_model=IdOut)
def api_vermietung_anlegen(payload: VermietungCreate):
    with _session() as s:
        try:
            v = vermietung_anlegen(
                s, payload.geraet_id, payload.kunde_id, payload.start_datum, payload.end_datum,
                payload.satz_wert, payload.satz_einheit, payload.zaehler_start,
                payload.baustelle_id, payload.notizen, payload.status
            )
            return IdOut(id=v.id)
        except ValueError as ex:
            raise HTTPException(400, str(ex))

@app.post("/vermietungen/{vermietung_id}/starten", response_model=VermietungOut)
def api_reservierung_starten(vermietung_id: int, payload: VermietungStart):
    with _session() as s:
        try:
            v = reservierung_starten(
                s, vermietung_id, start_datum=payload.start_datum,
                zaehler_start=payload.zaehler_start, baustelle_id=payload.baustelle_id
            )
            return _vm_to_out(v)
        except ValueError as ex:
            raise HTTPException(400, str(ex))

@app.post("/vermietungen/{vermietung_id}/schliessen", response_model=VermietungOut)
def api_vermietung_schliessen(vermietung_id: int, payload: VermietungClose):
    with _session() as s:
        try:
            v = vermietung_schliessen(
                s, vermietung_id, end_datum=payload.end_datum,
                zaehler_ende=payload.zaehler_ende, stunden_ist=payload.stunden_ist,
                rueckgabe_mietpark_id=payload.rueckgabe_mietpark_id
            )
            return _vm_to_out(v)
        except ValueError as ex:
            raise HTTPException(400, str(ex))

@app.get("/vermietungen", response_model=List[VermietungOut])
def api_vermietungen_list(
    status: Optional[VermietStatus] = Query(default=None),
    geraet_id: Optional[int] = Query(default=None),
    kunde_id: Optional[int] = Query(default=None),
    limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
):
    with _session() as s:
        q = select(Vermietung)
        if status:
            q = q.where(Vermietung.status == status)
        if geraet_id:
            q = q.where(Vermietung.geraet_id == geraet_id)
        if kunde_id:
            q = q.where(Vermietung.kunde_id == kunde_id)
        q = q.offset(offset).limit(limit)
        vs = list(s.scalars(q))
        return [_vm_to_out(v) for v in vs]

@app.get("/vermietungen/{vermietung_id}", response_model=VermietungOut)
def api_vermietung_get(vermietung_id: int):
    with _session() as s:
        v = s.get(Vermietung, vermietung_id)
        if not v:
            raise HTTPException(404, "Vermietung nicht gefunden")
        return _vm_to_out(v)

# -----------------------------------------------------------------------------
# Positionen & Rechnungen
# -----------------------------------------------------------------------------
@app.post("/vermietungen/{vermietung_id}/positionen", response_model=IdOut)
def api_position_hinzufuegen(vermietung_id: int, payload: PositionCreate):
    with _session() as s:
        try:
            p = position_hinzufuegen(
                s, vermietung_id, payload.typ, payload.menge, payload.preis_einzel,
                kosten_einzel=payload.kosten_einzel, einheit=payload.einheit, text=payload.text
            )
            return IdOut(id=p.id)
        except ValueError as ex:
            raise HTTPException(400, str(ex))

@app.get("/vermietungen/{vermietung_id}/positionen", response_model=List[PositionOut])
def api_positionen_list(vermietung_id: int, limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)):
    with _session() as s:
        q = select(VermietungPosition).where(VermietungPosition.vermietung_id == vermietung_id).offset(offset).limit(limit)
        ps = list(s.scalars(q))
        return [PositionOut(
            id=p.id, vermietung_id=p.vermietung_id, typ=p.typ, text=p.text,
            menge=p.menge, einheit=p.einheit, preis_einzel=p.preis_einzel, kosten_einzel=p.kosten_einzel
        ) for p in ps]

@app.post("/vermietungen/{vermietung_id}/rechnungen", response_model=IdOut)
def api_rechnung_hinzufuegen(vermietung_id: int, payload: RechnungCreate):
    with _session() as s:
        try:
            r = rechnung_hinzufuegen(
                s, vermietung_id, nummer=payload.nummer, datum=payload.datum,
                betrag_netto=payload.betrag_netto, bezahlt=payload.bezahlt
            )
            return IdOut(id=r.id)
        except ValueError as ex:
            raise HTTPException(400, str(ex))

@app.get("/vermietungen/{vermietung_id}/rechnungen", response_model=List[RechnungOut])
def api_rechnungen_list(vermietung_id: int, limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)):
    with _session() as s:
        q = select(Rechnung).where(Rechnung.vermietung_id == vermietung_id).offset(offset).limit(limit)
        rs = list(s.scalars(q))
        return [RechnungOut(
            id=r.id, vermietung_id=r.vermietung_id, nummer=r.nummer, datum=r.datum,
            betrag_netto=r.betrag_netto, bezahlt=bool(r.bezahlt)
        ) for r in rs]

@app.get("/rechnungen/suche", response_model=RechnungsSucheOut)
def api_rechnung_suche(nummer: str = Query(..., min_length=1, max_length=60)):
    with _session() as s:
        r = s.scalar(select(Rechnung).where(Rechnung.nummer == nummer))
        if not r:
            raise HTTPException(404, "Rechnungsnummer nicht gefunden")
        return RechnungsSucheOut(rechnung_id=r.id, vermietung_id=r.vermietung_id)

# -----------------------------------------------------------------------------
# Berichte
# -----------------------------------------------------------------------------
@app.get("/berichte/auslastung", response_model=AuslastungOut)
def api_auslastung(fenster_start: date = Query(...), fenster_ende: date = Query(...)):
    if fenster_ende < fenster_start:
        raise HTTPException(400, "fenster_ende muss >= fenster_start sein")
    with _session() as s:
        flotte, pro = flotten_auslastung_iststunden(s, fenster_start, fenster_ende)
        return AuslastungOut(
            fenster_start=fenster_start,
            fenster_ende=fenster_ende,
            flotte=round(flotte, 6),
            pro_geraet={str(k): round(v, 6) for k, v in pro.items()}  # Keys als Strings
        )

@app.get("/berichte/vermietungen/{vermietung_id}/abrechnung", response_model=AbrechnungOut)
def api_vermietung_abrechnung(vermietung_id: int):
    with _session() as s:
        try:
            abr = vermietung_abrechnung(s, vermietung_id)
            return AbrechnungOut(**abr)
        except ValueError as ex:
            raise HTTPException(400, str(ex))

@app.get("/berichte/geraete/{geraet_id}/finanzen", response_model=GeraetFinanzenOut)
def api_geraet_finanzen(geraet_id: int):
    with _session() as s:
        try:
            data = geraet_finanz_uebersicht(s, geraet_id)
            return GeraetFinanzenOut(**data)
        except ValueError as ex:
            raise HTTPException(404, str(ex))
