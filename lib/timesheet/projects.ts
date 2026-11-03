// The one list of projects people can book hours against.
export const PROJECTS = ["Client work", "Internal", "Meetings", "Training", "Leave"] as const;

export type Project = (typeof PROJECTS)[number];

export function isProject(value: unknown): value is Project {
  return typeof value === "string" && (PROJECTS as readonly string[]).includes(value);
}
