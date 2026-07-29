import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { makeActionCardData } from "@/test/factories";
import WhyPanel from "@/components/ticker/WhyPanel";

describe("WhyPanel", () => {
  it("renders the n_eff info tip via the shared InfoTip primitive, not the old inline tooltip", async () => {
    mockFetchJson({
      "/api/argus/action_card/NVDA": makeActionCardData({ symbol: "NVDA", n_eff: 12.3 }),
    });
    render(<WhyPanel ticker="NVDA" />);
    expect(await screen.findByRole("button", { name: /n_eff info/i })).toBeInTheDocument();
  });
});
