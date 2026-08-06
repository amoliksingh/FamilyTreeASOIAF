from __future__ import annotations
import re
from pathlib import Path
from models import Person


def _strip_at(value: str) -> str:
    """Remove @ delimiters from GEDCOM cross-reference IDs."""
    return re.sub(r"@", "", value).strip()


def _clean_name(raw: str) -> str:
    """Remove GEDCOM surname slashes and normalize whitespace."""
    return re.sub(r"/", "", raw).strip()


def parse_gedcom(filepath: str) -> tuple[dict, dict]:
    """
    Pass 1: Read GEDCOM file into raw dicts.
    Returns (raw_indi, raw_fam).
    FAMC entries are stored as dicts {id, pedi} so that step/adopted
    relationships can be separated from biological ones in pass 2.
    """
    raw_indi: dict[str, dict] = {}
    raw_fam: dict[str, dict] = {}

    current_type: str | None = None
    current_id: str | None = None
    current_famc_idx: int | None = None   # index of the last-seen FAMC entry
    name_set: set[str] = set()

    with open(filepath, encoding="utf-8-sig") as f:
        for line in f:
            parts = line.rstrip("\n").rstrip("\r").split(" ", 2)
            if len(parts) < 2:
                continue

            try:
                level = int(parts[0])
            except ValueError:
                continue

            tag   = parts[1] if len(parts) > 1 else ""
            value = parts[2] if len(parts) > 2 else ""

            if level == 0:
                current_type = None
                current_id   = None
                current_famc_idx = None
                if len(parts) == 3 and parts[2] in ("INDI", "FAM"):
                    raw_id = _strip_at(tag)
                    current_type = parts[2]
                    current_id   = raw_id
                    if current_type == "INDI":
                        raw_indi[current_id] = {
                            "name": "",
                            "givn": "",
                            "surn": "",
                            "sex": "other",
                            "famc": [],   # list of {id: str, pedi: str}
                            "fams": [],
                        }
                    else:
                        raw_fam[current_id] = {"husb": None, "wife": None, "chil": []}

            elif level == 1 and current_id:
                current_famc_idx = None   # reset on each level-1 tag
                if current_type == "INDI":
                    if tag == "NAME" and current_id not in name_set:
                        raw_indi[current_id]["name"] = _clean_name(value)
                        name_set.add(current_id)
                    elif tag == "SEX":
                        raw_indi[current_id]["sex"] = {
                            "M": "male", "F": "female",
                        }.get(value.strip(), "other")
                    elif tag == "FAMC":
                        entry = {"id": _strip_at(value), "pedi": "birth"}
                        raw_indi[current_id]["famc"].append(entry)
                        current_famc_idx = len(raw_indi[current_id]["famc"]) - 1
                    elif tag == "FAMS":
                        raw_indi[current_id]["fams"].append(_strip_at(value))
                elif current_type == "FAM":
                    if tag == "HUSB":
                        raw_fam[current_id]["husb"] = _strip_at(value)
                    elif tag == "WIFE":
                        raw_fam[current_id]["wife"] = _strip_at(value)
                    elif tag == "CHIL":
                        raw_fam[current_id]["chil"].append(_strip_at(value))

            elif level == 2 and current_id and current_type == "INDI":
                # Capture PEDI sub-tag for the most recent FAMC
                if tag == "PEDI" and current_famc_idx is not None:
                    raw_indi[current_id]["famc"][current_famc_idx]["pedi"] = value.strip().lower()
                elif tag == "GIVN":
                    raw_indi[current_id]["givn"] = value.strip()
                elif tag == "SURN":
                    raw_indi[current_id]["surn"] = value.strip()

    return raw_indi, raw_fam


def build_persons(raw_indi: dict, raw_fam: dict) -> dict[str, Person]:
    persons: dict[str, Person] = {}

    for indi_id, data in raw_indi.items():
        parent_ids:      list[str] = []
        step_parent_ids: list[str] = []

        for entry in data["famc"]:
            fam  = raw_fam.get(entry["id"], {})
            pedi = entry.get("pedi", "birth")
            # "birth" (and blank/unset) = biological; anything else = step/adopted/foster
            target = parent_ids if pedi == "birth" else step_parent_ids
            if fam.get("husb"):
                target.append(fam["husb"])
            if fam.get("wife"):
                target.append(fam["wife"])

        spouse_ids: list[str] = []
        child_ids:  list[str] = []
        for fam_id in data["fams"]:
            fam  = raw_fam.get(fam_id, {})
            husb = fam.get("husb")
            wife = fam.get("wife")
            if husb and husb != indi_id:
                spouse_ids.append(husb)
            if wife and wife != indi_id:
                spouse_ids.append(wife)
            child_ids.extend(fam.get("chil", []))

        # Siblings from parentless FAMC families (no husb or wife — siblings only)
        sibling_ids: list[str] = []
        for entry in data["famc"]:
            fam = raw_fam.get(entry["id"], {})
            if not fam.get("husb") and not fam.get("wife"):
                sibling_ids.extend(c for c in fam.get("chil", []) if c != indi_id)

        parent_ids      = list(dict.fromkeys(parent_ids))
        step_parent_ids = list(dict.fromkeys(step_parent_ids))
        spouse_ids      = list(dict.fromkeys(spouse_ids))
        child_ids       = list(dict.fromkeys(child_ids))
        sibling_ids     = list(dict.fromkeys(sibling_ids))

        full_name = data["name"] or f"Unknown ({indi_id})"
        parts     = full_name.split()
        # GIVN/SURN are authoritative when present (they can carry a
        # disambiguator, e.g. "Aegon I", that a naive name-split would lose);
        # fall back to splitting the full name for older/incomplete records.
        first_name = data["givn"] or (parts[0] if parts else full_name)
        last_name  = data["surn"] or (" ".join(parts[1:]) if len(parts) > 1 else "")
        persons[indi_id] = Person(
            id=indi_id,
            name=full_name,
            firstName=first_name,
            lastName=last_name,
            gender=data["sex"],
            parentIds=parent_ids,
            stepParentIds=step_parent_ids,
            spouseIds=spouse_ids,
            childIds=child_ids,
            siblingIds=sibling_ids,
        )

    return persons


if __name__ == "__main__":
    ged_path = Path(__file__).parent.parent / "FamilyTree.ged"
    raw_indi, raw_fam = parse_gedcom(str(ged_path))
    persons = build_persons(raw_indi, raw_fam)

    print(f"Total individuals: {len(persons)}")
    print(f"Total families:    {len(raw_fam)}")
    print()

    p = persons.get("I0001")
    if p:
        print(f"I0001: {p.name}")
        print(f"  parentIds:     {p.parentIds}")
        print(f"  stepParentIds: {p.stepParentIds}")

    subirt = persons.get("I0609")
    if subirt:
        print(f"\nI0609: {subirt.name}")
        print(f"  parentIds:     {subirt.parentIds}")
        print(f"  stepParentIds: {subirt.stepParentIds}")
        for sid in subirt.stepParentIds:
            print(f"    {sid}: {persons[sid].name}")
