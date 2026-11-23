// Project categories: plain code with no server-only imports, so the admin page (browser) and the server share it.

export type ProjectCategory = "client" | "internal" | "other";
export const CATEGORY_ORDER: ProjectCategory[] = ["client", "internal", "other"];
export const CATEGORY_LABEL: Record<ProjectCategory, string> = { client: "Client work", internal: "Internal", other: "Other" };
export const CATEGORY_HINT: Record<ProjectCategory, string> = {
  client: "Work for a client. Each client project is chosen by name.",
  internal: "Work on the company's own things.",
  other: "Anything else people log time against, like meetings.",
};
export const toCategory = (v: unknown): ProjectCategory => (v === "client" || v === "internal" ? v : "other");
