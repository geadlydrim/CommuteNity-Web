"use client";

/**
 * Whether the server has a router configured (`ROUTER_URL`, ADR 0007). The root
 * layout reads it and passes only this boolean down; the builders read it
 * through `useRoutingAvailable()` and, when it is false, draw straight lines
 * without ever calling `/api/route`.
 */
import { createContext, useContext } from "react";

/** Assume available outside a provider: the scheduler's 503 short-circuit still covers the unconfigured case. */
const RoutingAvailabilityContext = createContext(true);

export function RoutingAvailabilityProvider({
  available,
  children,
}: {
  available: boolean;
  children: React.ReactNode;
}) {
  return <RoutingAvailabilityContext value={available}>{children}</RoutingAvailabilityContext>;
}

export function useRoutingAvailable(): boolean {
  return useContext(RoutingAvailabilityContext);
}
