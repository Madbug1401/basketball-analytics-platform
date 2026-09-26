"use client";

import { usePathname } from "next/navigation";

/**
 * Id from the URL, read from the pathname instead of useParams(): offline, the service
 * worker serves one cached HTML shell (/jogos/_ …) for every id, and the pathname is
 * the only thing that always reflects the real address.
 */
export function useRouteId(): string {
  const parts = usePathname().split("/").filter(Boolean);
  return decodeURIComponent(parts[1] ?? "");
}
