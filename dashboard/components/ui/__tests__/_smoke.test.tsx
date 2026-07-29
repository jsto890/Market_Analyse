import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("jsdom + React Testing Library wiring", () => {
  it("mounts a component into a real DOM", () => {
    render(<div>hello from jsdom</div>);
    // Plain jsdom/DOM assertion only — jest-dom matchers (toBeInTheDocument, etc.)
    // aren't wired until Task 3, so this smoke test must not depend on them.
    expect(screen.getByText("hello from jsdom").textContent).toBe("hello from jsdom");
  });
});
