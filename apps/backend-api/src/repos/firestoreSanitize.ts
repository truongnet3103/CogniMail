export const stripUndefined = <T>(input: T): T => {
  if (Array.isArray(input)) {
    return input
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined) as T;
  }

  if (input && typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value === undefined) {
        continue;
      }
      result[key] = stripUndefined(value);
    }
    return result as T;
  }

  return input;
};
