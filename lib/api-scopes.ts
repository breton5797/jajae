/** API scope constants — crypto-free so client components can import safely. */
export const API_SCOPES = [
  "products:read",
  "orders:read",
  "pos:read",
  "inventory:write",
  "settlements:read",
] as const;
