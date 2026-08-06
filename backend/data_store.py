from __future__ import annotations
from pathlib import Path
from models import Person
from parser import parse_gedcom, build_persons

_persons: dict[str, Person] = {}


def load() -> None:
    global _persons
    ged_path = Path(__file__).parent.parent / "ASOIAF.ged"
    raw_indi, raw_fam = parse_gedcom(str(ged_path))
    _persons = build_persons(raw_indi, raw_fam)
    print(f"[data_store] Loaded {len(_persons)} individuals from {ged_path.name}")


def get_persons() -> dict[str, Person]:
    return _persons
