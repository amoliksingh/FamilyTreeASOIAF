export interface Person {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female" | "other";
  parentIds: string[];
  stepParentIds: string[];
  spouseIds: string[];
  childIds: string[];
  siblingIds: string[];
}

export interface PersonSummary {
  id: string;
  name: string;
  gender: string;
}

export type PersonMap = Record<string, Person>;

export interface ConnectionHop {
  person: Person;
  relationshipToNext: string | null;
}

export interface ConnectionResponse {
  found: boolean;
  paths: ConnectionHop[][];
}
