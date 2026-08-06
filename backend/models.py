from __future__ import annotations
from typing import Literal
from pydantic import BaseModel


class Person(BaseModel):
    id: str
    name: str
    firstName: str
    lastName: str
    gender: Literal["male", "female", "other"]
    parentIds: list[str] = []
    stepParentIds: list[str] = []
    spouseIds: list[str] = []
    childIds: list[str] = []
    siblingIds: list[str] = []


class PersonSummary(BaseModel):
    id: str
    name: str
    gender: str


class TreeResponse(BaseModel):
    center: Person
    nodes: list[Person]


class ConnectionHop(BaseModel):
    person: Person
    relationshipToNext: str | None


class ConnectionResponse(BaseModel):
    found: bool
    paths: list[list[ConnectionHop]]
