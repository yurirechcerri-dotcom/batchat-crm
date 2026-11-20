import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

describe("download anônimo dos manifestos estáticos de tema", () => {
  it("permite o manifesto identificado por SHA-256 que o instalador busca sem sessão", () => {
    expect(isPublicPath(`/packages/${"a".repeat(64)}.json`)).toBe(true);
  });

  it.each([
    "/packages",
    "/packages/config.json",
    `/packages/${"a".repeat(63)}.json`,
    `/packages/${"g".repeat(64)}.json`,
    `/packages/${"a".repeat(64)}.json/extra`,
    `/packages/nested/${"a".repeat(64)}.json`,
    "/app/settings.json",
    "/admin/brand.json",
    "/api/v1/extensions/install",
  ])("mantém protegido o caminho vizinho %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
