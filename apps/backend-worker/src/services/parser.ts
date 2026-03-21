import type { Email } from "../shared-types";

export const attachEmailMetadata = (emails: Email[]): Email[] =>
  [...emails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
