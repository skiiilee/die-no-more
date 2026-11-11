import { describe, expect, it } from "vitest";
import { decideAccess } from "./access-decision";

describe("decideAccess", () => {
  it("sends signed-out visitors to S01 and remembers the target", () => {
    expect(decideAccess("/plants/42", "?tab=log", false)).toEqual({
      kind: "redirect",
      to: "/login?next=%2Fplants%2F42%3Ftab%3Dlog",
    });
  });

  it("uses S02 as the target for the root path", () => {
    expect(decideAccess("/", "", false)).toEqual({ kind: "redirect", to: "/login?next=%2Ftoday" });
  });

  it("lets signed-out visitors open S01", () => {
    expect(decideAccess("/login", "", false)).toEqual({ kind: "allow" });
  });

  it("moves signed-in users from S01 to S02", () => {
    expect(decideAccess("/login", "", true)).toEqual({ kind: "redirect", to: "/today" });
  });

  it("allows signed-in users anywhere else", () => {
    expect(decideAccess("/health", "", true)).toEqual({ kind: "allow" });
  });
});
