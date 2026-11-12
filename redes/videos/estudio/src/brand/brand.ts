// Copyright (c) 2026 Enrique Rocha (@soyenriquerocha)
// SPDX-License-Identifier: MIT
// id: er-22575577
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import raw from "../../brand.json";

// Fuentes de Nexo, las mismas de la app (frontend/fonts): Satoshi en los
// títulos e Inter en el resto. Satoshi no está en Google Fonts, así que van
// como archivos en public/fonts. Ver skills/motion-architect/references/brand.md
loadFont({ family: "Satoshi", url: staticFile("fonts/satoshi-500.woff2"), weight: "500" });
loadFont({ family: "Satoshi", url: staticFile("fonts/satoshi-700.woff2"), weight: "700" });
loadFont({ family: "Inter", url: staticFile("fonts/inter.woff2"), weight: "100 900" });

export const brand = {
  ...raw,
  fontDisplay: "Satoshi",
  fontBody: "Inter",
};

export type Brand = typeof brand;
