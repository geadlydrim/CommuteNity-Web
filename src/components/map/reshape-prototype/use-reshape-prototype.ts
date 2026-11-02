"use client";
/** PROTOTYPE — throwaway (issue #4) */
import { createElement, useState, type ReactElement, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import type { MapRef } from "../primitives";
import type { ProtoLeg, ReshapeVariant, ReshapeVariantProps, VariantKey } from "./contract";
import { PathLayers, pathLayerId } from "./path-layers";
import { Switcher } from "./switcher";
import { useFakeRouting, useViaState } from "./state";
import { useVariantA } from "./variant-a";
import { useVariantB } from "./variant-b";
import { useVariantC } from "./variant-c";

export type ReshapePrototype = {
  pathLayers: ReactElement;
  variant: ReshapeVariant;
  switcher: ReactElement;
};

export function useReshapePrototype(
  legs: ProtoLeg[],
  mapRef: RefObject<MapRef | null>
): ReshapePrototype | null {
  const param = useSearchParams().get("variant");
  const key: VariantKey | null =
    process.env.NODE_ENV !== "production" && (param === "A" || param === "B" || param === "C")
      ? param
      : null;

  const [fail, setFail] = useState(false);
  const viaState = useViaState(legs.map((l) => l.id));
  const routes = useFakeRouting(legs, viaState.vias, { fail });

  const props = (v: string): ReshapeVariantProps => ({ legs, mapRef, viaState, routes, pathLayerId, active: key === v });
  // All three every render (rules of hooks); only the selected one is used and active.
  const a = useVariantA(props("A"));
  const b = useVariantB(props("B"));
  const c = useVariantC(props("C"));

  if (!key) return null;
  return {
    pathLayers: createElement(PathLayers, { legs, routes, vias: viaState.vias }),
    variant: { A: a, B: b, C: c }[key],
    switcher: createElement(Switcher, {
      variant: key,
      legs,
      vias: viaState.vias,
      routes,
      fail,
      onFailChange: setFail,
    }),
  };
}
