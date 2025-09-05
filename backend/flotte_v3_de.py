# flotte_v3_de.py
from __future__ import annotations

from datetime import date, datetime, timedelta
from enum import Enum
from typing import Optional, Iterable, Dict, Tuple, List

from sqlalchemy import (
    create_engine, String, Enum as SAEnum, Integer, Float, Date, DateTime,
    ForeignKey, CheckConstraint, UniqueConstraint, select, func, or_
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session
)
from sqlalchemy.exc import IntegrityError

# ================== DB ==================
ENGINE = create_engine("sqlite:///flotte_v3.db", echo=False, future=True)
SessionLocal = sessionmaker(bind=ENGINE, autoflush=False, expire_on_commit=False, future=True)
# ========================================

class Base(DeclarativeBase):
    pass

# -------------------- Enums --------------------

class GeraetStatus(str, Enum):
    VERFUEGBAR = "VERFUEGBAR"
    VERMIETET = "VERMIETET"
    WARTUNG = "WARTUNG"
    AUSGEMUSTERT = "AUSGEMUSTERT"

class VermietStatus(str, Enum):
    RESERVIERT = "RESERVIERT"   # reserviert, noch nicht ausgeliefert
    OFFEN = "OFFEN"
    GESCHLOSSEN = "GESCHLOSSEN"
    STORNIERT = "STORNIERT"

class SatzEinheit(str, Enum):
    TAEGLICH = "TAEGLICH"
    MONATLICH = "MONATLICH"

class ZaehlerArt(str, Enum):
    ABGABE = "ABGABE"
    RUECKNAHME = "RUECKNAHME"
    PERIODISCH = "PERIODISCH"

class StandortTyp(str, Enum):
    MIETPARK = "MIETPARK"
    KUNDE = "KUNDE"

class PosTyp(str, Enum):
    MONTAGE = "MONTAGE"
    ERSATZTEIL = "ERSATZTEIL"
    SERVICEPAUSCHALE = "SERVICEPAUSCHALE"
    VERSICHERUNG = "VERSICHERUNG"
    SONSTIGES = "SONSTIGES"

# -------------------- Tabellen --------------------

class Firma(Base):
    __tablename__ = "firma"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    land: Mapped[Optional[str]] = mapped_column(String(2))
    geraete: Mapped[List["Geraet"]] = relationship(back_populates="eigentuemer")

class Mietpark(Base):
    __tablename__ = "mietpark"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    adresse: Mapped[Optional[str]] = mapped_column(String(260))

class Geraet(Base):
    __tablename__ = "geraet"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    eigentuemer_firma_id: Mapped[Optional[int]] = mapped_column(ForeignKey("firma.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kategorie: Mapped[str] = mapped_column(String(60), nullable=False)
    modell: Mapped[Optional[str]] = mapped_column(String(120))
    seriennummer: Mapped[Optional[str]] = mapped_column(String(120))
    status: Mapped[GeraetStatus] = mapped_column(SAEnum(GeraetStatus), default=GeraetStatus.VERFUEGBAR, nullable=False)
    stundenzaehler: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    stunden_pro_tag: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    kauf_datum: Mapped[Optional[date]] = mapped_column(Date)
    anschaffungspreis: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Standortführung
    standort_typ: Mapped[StandortTyp] = mapped_column(SAEnum(StandortTyp), default=StandortTyp.MIETPARK, nullable=False)
    akt_mietpark_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mietpark.id", ondelete="SET NULL"))
    akt_baustelle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("baustelle.id", ondelete="SET NULL"))
    heim_mietpark_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mietpark.id", ondelete="SET NULL"))

    eigentuemer: Mapped[Optional[Firma]] = relationship(back_populates="geraete")
    vermietungen: Mapped[List["Vermietung"]] = relationship(back_populates="geraet", cascade="all, delete-orphan")
    wartungen: Mapped[List["Wartung"]] = relationship(back_populates="geraet", cascade="all, delete-orphan")
    zaehlerstaende: Mapped[List["Zaehlerstand"]] = relationship(back_populates="geraet", cascade="all, delete-orphan")

class Kunde(Base):
    __tablename__ = "kunde"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(160))
    telefon: Mapped[Optional[str]] = mapped_column(String(60))
    rechnungsadresse: Mapped[Optional[str]] = mapped_column(String(260))
    ust_id: Mapped[Optional[str]] = mapped_column(String(40))

class Baustelle(Base):
    __tablename__ = "baustelle"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kunde_id: Mapped[Optional[int]] = mapped_column(ForeignKey("kunde.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    adresse: Mapped[Optional[str]] = mapped_column(String(260))
    stadt: Mapped[Optional[str]] = mapped_column(String(120))
    land: Mapped[Optional[str]] = mapped_column(String(2))

class Vermietung(Base):
    __tablename__ = "vermietung"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    geraet_id: Mapped[int] = mapped_column(ForeignKey("geraet.id", ondelete="RESTRICT"), nullable=False)
    kunde_id: Mapped[int] = mapped_column(ForeignKey("kunde.id", ondelete="RESTRICT"), nullable=False)
    baustelle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("baustelle.id", ondelete="SET NULL"))

    start_datum: Mapped[date] = mapped_column(Date, nullable=False)
    end_datum: Mapped[Optional[date]] = mapped_column(Date)

    zaehler_start: Mapped[Optional[float]] = mapped_column(Float)
    zaehler_ende: Mapped[Optional[float]] = mapped_column(Float)
    stunden_ist: Mapped[Optional[float]] = mapped_column(Float)  # final bei Rueckgabe

    satz_wert: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    satz_einheit: Mapped[SatzEinheit] = mapped_column(SAEnum(SatzEinheit), nullable=False, default=SatzEinheit.TAEGLICH)

    status: Mapped[VermietStatus] = mapped_column(SAEnum(VermietStatus), default=VermietStatus.OFFEN, nullable=False)
    notizen: Mapped[Optional[str]] = mapped_column(String(500))

    geraet: Mapped[Geraet] = relationship(back_populates="vermietungen")
    positionen: Mapped[List["VermietungPosition"]] = relationship(back_populates="vermietung", cascade="all, delete-orphan")
    rechnungen: Mapped[List["Rechnung"]] = relationship(back_populates="vermietung", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("(zaehler_ende IS NULL) OR (zaehler_start IS NULL) OR (zaehler_ende >= zaehler_start)",
                        name="ck_zaehler_nichtnegativ"),
    )

class VermietungPosition(Base):
    __tablename__ = "vermietung_position"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vermietung_id: Mapped[int] = mapped_column(ForeignKey("vermietung.id", ondelete="CASCADE"))
    typ: Mapped[PosTyp] = mapped_column(SAEnum(PosTyp), nullable=False)
    text: Mapped[Optional[str]] = mapped_column(String(200))
    menge: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    einheit: Mapped[Optional[str]] = mapped_column(String(20), default="STK")
    preis_einzel: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)   # Einnahmen
    kosten_einzel: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # interne Kosten
    vermietung: Mapped[Vermietung] = relationship(back_populates="positionen")

class Rechnung(Base):
    __tablename__ = "rechnung"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vermietung_id: Mapped[int] = mapped_column(ForeignKey("vermietung.id", ondelete="CASCADE"))
    nummer: Mapped[str] = mapped_column(String(60), nullable=False)
    datum: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    betrag_netto: Mapped[Optional[float]] = mapped_column(Float)
    bezahlt: Mapped[bool] = mapped_column(Integer, default=0)  # 0/1
    __table_args__ = (UniqueConstraint("nummer", name="uq_rechnung_nummer"),)
    vermietung: Mapped[Vermietung] = relationship(back_populates="rechnungen")

class Wartung(Base):
    __tablename__ = "wartung"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    geraet_id: Mapped[int] = mapped_column(ForeignKey("geraet.id", ondelete="CASCADE"))
    start_datum: Mapped[date] = mapped_column(Date, nullable=False)
    end_datum: Mapped[date] = mapped_column(Date, nullable=False)
    grund: Mapped[Optional[str]] = mapped_column(String(160))
    notizen: Mapped[Optional[str]] = mapped_column(String(500))
    geraet: Mapped[Geraet] = relationship(back_populates="wartungen")

class Zaehlerstand(Base):
    __tablename__ = "zaehlerstand"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    geraet_id: Mapped[int] = mapped_column(ForeignKey("geraet.id", ondelete="CASCADE"))
    zeitpunkt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    art: Mapped[ZaehlerArt] = mapped_column(SAEnum(ZaehlerArt), nullable=False, default=ZaehlerArt.PERIODISCH)
    stand: Mapped[float] = mapped_column(Float, nullable=False)
    geraet: Mapped[Geraet] = relationship(back_populates="zaehlerstaende")

# -------------------- Setup --------------------

def init_db() -> None:
    Base.metadata.create_all(ENGINE)

# -------------------- Helper & CRUD --------------------

def mietpark_anlegen(s: Session, name: str, adresse: Optional[str] = None) -> Mietpark:
    m = Mietpark(name=name, adresse=adresse); s.add(m); s.commit(); s.refresh(m); return m

def firma_anlegen(s: Session, name: str, land: Optional[str] = None) -> Firma:
    f = Firma(name=name, land=land); s.add(f); s.commit(); s.refresh(f); return f

def geraet_anlegen(
    s: Session, name: str, kategorie: str, modell: Optional[str] = None, seriennummer: Optional[str] = None,
    stundenzaehler: float = 0.0, stunden_pro_tag: int = 8, kauf_datum: Optional[date] = None,
    anschaffungspreis: float = 0.0, heim_mietpark_id: Optional[int] = None, akt_mietpark_id: Optional[int] = None,
    eigentuemer_firma_id: Optional[int] = None
) -> Geraet:
    g = Geraet(
        name=name, kategorie=kategorie, modell=modell, seriennummer=seriennummer,
        status=GeraetStatus.VERFUEGBAR, stundenzaehler=stundenzaehler, stunden_pro_tag=stunden_pro_tag,
        kauf_datum=kauf_datum, anschaffungspreis=anschaffungspreis,
        heim_mietpark_id=heim_mietpark_id, akt_mietpark_id=akt_mietpark_id or heim_mietpark_id,
        standort_typ=StandortTyp.MIETPARK, eigentuemer_firma_id=eigentuemer_firma_id
    )
    s.add(g); s.commit(); s.refresh(g); return g

def kunde_anlegen(s: Session, name: str, email: Optional[str] = None, telefon: Optional[str] = None,
                  rechnungsadresse: Optional[str] = None, ust_id: Optional[str] = None) -> Kunde:
    k = Kunde(name=name, email=email, telefon=telefon, rechnungsadresse=rechnungsadresse, ust_id=ust_id)
    s.add(k); s.commit(); s.refresh(k); return k

def baustelle_anlegen(s: Session, kunde_id: int, name: str, adresse: Optional[str] = None,
                      stadt: Optional[str] = None, land: Optional[str] = None) -> Baustelle:
    b = Baustelle(kunde_id=kunde_id, name=name, adresse=adresse, stadt=stadt, land=land)
    s.add(b); s.commit(); s.refresh(b); return b

def _ueberlappung(s: Session, geraet_id: int, start: date, ende: Optional[date]) -> bool:
    v = Vermietung; e2 = ende or date.max
    q = select(func.count(v.id)).where(
        v.geraet_id == geraet_id,
        v.status.in_([VermietStatus.RESERVIERT, VermietStatus.OFFEN, VermietStatus.GESCHLOSSEN]),
        v.start_datum <= e2, or_(v.end_datum == None, v.end_datum >= start)
    )
    return (s.scalar(q) or 0) > 0

def vermietung_anlegen(
    s: Session, geraet_id: int, kunde_id: int, start_datum: date, end_datum: Optional[date],
    satz_wert: float, satz_einheit: SatzEinheit = SatzEinheit.TAEGLICH, zaehler_start: Optional[float] = None,
    baustelle_id: Optional[int] = None, notizen: Optional[str] = None, status: VermietStatus = VermietStatus.OFFEN
) -> Vermietung:
    g = s.get(Geraet, geraet_id)
    if not g: raise ValueError("Geraet nicht gefunden")
    if g.status in (GeraetStatus.AUSGEMUSTERT, GeraetStatus.WARTUNG):
        raise ValueError(f"Status {g.status}: Vermietung unmoeglich")
    if _ueberlappung(s, geraet_id, start_datum, end_datum):
        raise ValueError("Ueberlappende Reservierung/Vermietung vorhanden")

    v = Vermietung(
        geraet_id=geraet_id, kunde_id=kunde_id, baustelle_id=baustelle_id,
        start_datum=start_datum, end_datum=end_datum,
        zaehler_start=None if status == VermietStatus.RESERVIERT else (g.stundenzaehler if zaehler_start is None else zaehler_start),
        satz_wert=satz_wert, satz_einheit=satz_einheit, status=status, notizen=notizen
    )
    s.add(v)

    # Nur bei echter Auslieferung (OFFEN) Gerät/Standort ändern & Checkout-Snapshot
    if status == VermietStatus.OFFEN:
        g.status = GeraetStatus.VERMIETET
        g.standort_typ = StandortTyp.KUNDE
        g.akt_baustelle_id = baustelle_id
        s.add(Zaehlerstand(geraet_id=geraet_id, art=ZaehlerArt.ABGABE, stand=v.zaehler_start or g.stundenzaehler))

    s.commit(); s.refresh(v); return v

def reservierung_starten(
    s: Session, vermietung_id: int, start_datum: date, zaehler_start: Optional[float] = None, baustelle_id: Optional[int] = None
) -> Vermietung:
    v = s.get(Vermietung, vermietung_id)
    if not v: raise ValueError("Vermietung/Reservierung nicht gefunden")
    if v.status != VermietStatus.RESERVIERT:
        raise ValueError("Nur Reservierungen koennen gestartet werden")
    g = v.geraet
    v.start_datum = start_datum
    v.status = VermietStatus.OFFEN
    v.baustelle_id = baustelle_id if baustelle_id is not None else v.baustelle_id
    v.zaehler_start = g.stundenzaehler if zaehler_start is None else zaehler_start

    g.status = GeraetStatus.VERMIETET
    g.standort_typ = StandortTyp.KUNDE
    g.akt_baustelle_id = v.baustelle_id
    s.add(Zaehlerstand(geraet_id=g.id, art=ZaehlerArt.ABGABE, stand=v.zaehler_start or g.stundenzaehler))
    s.commit(); s.refresh(v); return v

def vermietung_schliessen(
    s: Session, vermietung_id: int, end_datum: date, zaehler_ende: Optional[float] = None,
    stunden_ist: Optional[float] = None, rueckgabe_mietpark_id: Optional[int] = None
) -> Vermietung:
    v = s.get(Vermietung, vermietung_id)
    if not v: raise ValueError("Vermietung nicht gefunden")
    if v.status not in (VermietStatus.OFFEN,): raise ValueError("Nur OFFENE Vermietungen koennen geschlossen werden")
    if end_datum < v.start_datum: raise ValueError("end_datum vor start_datum")
    v.end_datum = end_datum

    if zaehler_ende is not None:
        if v.zaehler_start is None: raise ValueError("zaehler_start fehlt")
        if zaehler_ende < v.zaehler_start: raise ValueError("zaehler_ende < zaehler_start")
        v.zaehler_ende = zaehler_ende
        v.stunden_ist = round(zaehler_ende - v.zaehler_start, 2)
        g = v.geraet; g.stundenzaehler = zaehler_ende
        s.add(Zaehlerstand(geraet_id=g.id, art=ZaehlerArt.RUECKNAHME, stand=zaehler_ende))
    elif stunden_ist is not None:
        if stunden_ist < 0: raise ValueError("stunden_ist negativ")
        v.stunden_ist = float(stunden_ist)
    else:
        raise ValueError("zaehler_ende ODER stunden_ist angeben")

    v.status = VermietStatus.GESCHLOSSEN

    # Standort zurück in den Mietpark
    g = v.geraet
    g.status = GeraetStatus.VERFUEGBAR
    g.standort_typ = StandortTyp.MIETPARK
    g.akt_baustelle_id = None
    g.akt_mietpark_id = rueckgabe_mietpark_id or g.heim_mietpark_id

    s.commit(); s.refresh(v); return v

def wartung_hinzufuegen(s: Session, geraet_id: int, start_datum: date, end_datum: date,
                        grund: Optional[str] = None, notizen: Optional[str] = None) -> Wartung:
    if end_datum < start_datum: raise ValueError("end_datum >= start_datum erforderlich")
    if not s.get(Geraet, geraet_id): raise ValueError("Geraet nicht gefunden")
    w = Wartung(geraet_id=geraet_id, start_datum=start_datum, end_datum=end_datum, grund=grund, notizen=notizen)
    s.add(w); s.commit(); s.refresh(w); return w

# ---- Positionen & Rechnungen ----

def position_hinzufuegen(
    s: Session, vermietung_id: int, typ: PosTyp, menge: float, preis_einzel: float,
    kosten_einzel: float = 0.0, einheit: str = "STK", text: Optional[str] = None
) -> VermietungPosition:
    v = s.get(Vermietung, vermietung_id)
    if not v: raise ValueError("Vermietung nicht gefunden")
    p = VermietungPosition(vermietung_id=vermietung_id, typ=typ, text=text, menge=menge,
                           einheit=einheit, preis_einzel=preis_einzel, kosten_einzel=kosten_einzel)
    s.add(p); s.commit(); s.refresh(p); return p

def rechnung_hinzufuegen(
    s: Session, vermietung_id: int, nummer: str, datum: Optional[date] = None,
    betrag_netto: Optional[float] = None, bezahlt: bool = False
) -> Rechnung:
    r = Rechnung(vermietung_id=vermietung_id, nummer=nummer, datum=datum or date.today(),
                 betrag_netto=betrag_netto, bezahlt=1 if bezahlt else 0)
    s.add(r)
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        raise ValueError(f"Rechnungsnummer '{nummer}' existiert bereits.")
    s.refresh(r); return r

# -------------------- Abrechnung & KPIs --------------------

def _tage_in_klammer(start: date, ende: date) -> int:
    return (ende - start).days + 1

def betrag_30_tage_monat(satz_wert: float, einheit: SatzEinheit, start: date, ende: date) -> float:
    tage = _tage_in_klammer(start, ende)
    if einheit == SatzEinheit.TAEGLICH: return round(satz_wert * tage, 2)
    if einheit == SatzEinheit.MONATLICH: return round(satz_wert / 30.0 * tage, 2)
    raise ValueError("unbekannte Einheit")

# ---- Rollierende Monatsabrechnung (Anker = Starttag) ----

def _letzter_tag_im_monat(jahr: int, monat: int) -> int:
    first_next = (date(jahr, monat, 28) + timedelta(days=4)).replace(day=1)
    return (first_next - timedelta(days=1)).day

def _add_monat_mit_anker(d: date, anchor_day: int, n: int = 1) -> date:
    y, m = d.year, d.month + n
    while m > 12: y += 1; m -= 12
    while m < 1: y -= 1; m += 12
    last = _letzter_tag_im_monat(y, m)
    day = min(anchor_day, last)
    return date(y, m, day)

def betrag_rollierender_monat(satz_wert: float, start: date, ende: date) -> float:
    if ende < start: return 0.0
    anchor_day = start.day
    gesamt = 0.0
    zyklus_start = start
    while zyklus_start <= ende:
        naechster_zyklus_start = _add_monat_mit_anker(zyklus_start, anchor_day, 1)
        zyklus_ende = naechster_zyklus_start - timedelta(days=1)
        seg_start = max(start, zyklus_start)
        seg_ende = min(ende, zyklus_ende)
        if seg_ende >= seg_start:
            tage_im_zyklus = (zyklus_ende - zyklus_start).days + 1
            genutzt = (seg_ende - seg_start).days + 1
            gesamt += satz_wert * (genutzt / tage_im_zyklus)
        zyklus_start = naechster_zyklus_start
    return round(gesamt, 2)

def miete_betrag(v: Vermietung, kalendermonat_proration: bool = False) -> float:
    if v.end_datum is None: raise ValueError("Vermietung noch offen")
    if v.satz_einheit == SatzEinheit.TAEGLICH:
        return betrag_30_tage_monat(v.satz_wert, v.satz_einheit, v.start_datum, v.end_datum)
    return betrag_rollierender_monat(v.satz_wert, v.start_datum, v.end_datum)

def vermietung_abrechnung(s: Session, vermietung_id: int) -> Dict[str, float]:
    v = s.get(Vermietung, vermietung_id)
    if not v or v.end_datum is None: raise ValueError("Vermietung nicht gefunden oder offen")
    miete = miete_betrag(v)
    pos_summe = sum(p.preis_einzel * p.menge for p in v.positionen)
    einnahmen = miete + pos_summe
    kosten = sum(p.kosten_einzel * p.menge for p in v.positionen)
    marge = einnahmen - kosten
    return {
        "miete": round(miete, 2),
        "positionen_einnahmen": round(pos_summe, 2),
        "einnahmen_gesamt": round(einnahmen, 2),
        "kosten_gesamt": round(kosten, 2),
        "marge": round(marge, 2)
    }

def geraet_finanz_uebersicht(s: Session, geraet_id: int) -> Dict[str, float]:
    g = s.get(Geraet, geraet_id)
    if not g: raise ValueError("Geraet nicht gefunden")
    verm: Iterable[Vermietung] = s.scalars(select(Vermietung).where(Vermietung.geraet_id == g.id, Vermietung.status == VermietStatus.GESCHLOSSEN))
    sum_einnahmen = 0.0; sum_kosten = 0.0
    for v in verm:
        abr = vermietung_abrechnung(s, v.id)
        sum_einnahmen += abr["einnahmen_gesamt"]
        sum_kosten += abr["kosten_gesamt"]
    netto = sum_einnahmen - sum_kosten
    roi_vs_einkauf = None; payback_erreicht = None
    if g.anschaffungspreis > 0:
        roi_vs_einkauf = round((netto - g.anschaffungspreis) / g.anschaffungspreis * 100.0, 2)
        payback_erreicht = netto >= g.anschaffungspreis
    return {
        "einnahmen_brutto": round(sum_einnahmen, 2),
        "kosten_intern": round(sum_kosten, 2),
        "einnahmen_netto": round(netto, 2),
        "anschaffungspreis": round(g.anschaffungspreis, 2),
        "payback_erreicht": bool(payback_erreicht) if payback_erreicht is not None else None,
        "roi_vs_anschaffung_prozent": roi_vs_einkauf
    }

# -------------------- Auslastung (Ist-Stunden) --------------------

def _ueberlapp_tage(a_start: date, a_ende: date, b_start: date, b_ende: date) -> int:
    s_ = max(a_start, b_start); e_ = min(a_ende, b_ende)
    return 0 if e_ < s_ else (e_ - s_).days + 1

def flotten_auslastung_iststunden(s: Session, fenster_start: date, fenster_ende: date) -> Tuple[float, Dict[int, float]]:
    if fenster_ende < fenster_start: raise ValueError("fenster_ende >= fenster_start erforderlich")
    total_tage = (fenster_ende - fenster_start).days + 1
    geraete: list[Geraet] = list(s.scalars(select(Geraet).where(Geraet.status != GeraetStatus.AUSGEMUSTERT)))

    avail: Dict[int, float] = {g.id: float(g.stunden_pro_tag * total_tage) for g in geraete}
    rented: Dict[int, float] = {g.id: 0.0 for g in geraete}

    v = Vermietung
    vermietungen: Iterable[Vermietung] = s.scalars(
        select(v).where(
            v.start_datum <= fenster_ende,
            or_(v.end_datum == None, v.end_datum >= fenster_start),
        )
    )

    for m in vermietungen:
        ov = _ueberlapp_tage(m.start_datum, m.end_datum or fenster_ende, fenster_start, fenster_ende)
        if ov <= 0: continue
        if m.status == VermietStatus.GESCHLOSSEN and m.stunden_ist is not None and m.end_datum:
            gesamt = (m.end_datum - m.start_datum).days + 1
            anteil = ov / gesamt if gesamt > 0 else 0.0
            rented[m.geraet_id] += float(m.stunden_ist * anteil)

    per_eq = {}
    sum_rent = sum(rented.values())
    sum_av = sum(avail.values())
    for gid, a in avail.items():
        r = rented[gid]
        per_eq[gid] = 0.0 if a <= 0 else min(r / a, 1.0)
    fleet = 0.0 if sum_av <= 0 else min(sum_rent / sum_av, 1.0)
    return fleet, per_eq

# -------------------- Demo (optional) --------------------
def _demo():
    init_db()
    with SessionLocal() as s:
        mp = mietpark_anlegen(s, "Mietpark Passau", "Industriestr. 1, 94032 Passau")
        f = firma_anlegen(s, "Knoedlseder Gruppe", "DE")
        g1 = geraet_anlegen(s, name="Comacchio MC 30", kategorie="drill_rig", modell="MC30",
                            seriennummer="MC30-001", stundenzaehler=1200.0, stunden_pro_tag=8,
                            anschaffungspreis=185000.0, heim_mietpark_id=mp.id, eigentuemer_firma_id=f.id)
        k = kunde_anlegen(s, "Mueller Tiefbau GmbH", email="info@mueller.de")
        b = baustelle_anlegen(s, k.id, "Bauvorhaben A", "Hauptstr. 5", "Passau", "DE")

        # Reservierung (blockt Zeitraum)
        res = vermietung_anlegen(s, g1.id, k.id, date(2025, 8, 23), date(2025, 9, 22),
                                 satz_wert=4800.0, satz_einheit=SatzEinheit.MONATLICH,
                                 baustelle_id=b.id, status=VermietStatus.RESERVIERT)
        # Start am 23.
        reservierung_starten(s, res.id, start_datum=date(2025, 8, 23), zaehler_start=1200.0)

        # Rückgabe am 10.09 mit 40h
        vermietung_schliessen(s, res.id, end_datum=date(2025, 9, 10), stunden_ist=40.0)

        # Rechnung anlegen (unique Nummer)
        nr = f"RE-{datetime.utcnow():%Y%m%d%H%M%S}"
        rechnung_hinzufuegen(s, res.id, nummer=nr)

        abr = vermietung_abrechnung(s, res.id)
        print("Abrechnung:", abr)  # Monatsrate rollierend ab 23.

if __name__ == "__main__":
    _demo()

