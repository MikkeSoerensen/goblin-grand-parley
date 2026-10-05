import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGame } from "@/lib/store";
import type { ClientView, Highlight } from "../../../shared/types";
import { EventStrip } from "./EventStrip";

const setHighlights = (highlights: Highlight[]) =>
  act(() => { useGame.setState({ view: { highlights } as unknown as ClientView }); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); useGame.setState({ view: null }); });

describe("EventStrip", () => {
  it("does not replay moments that happened before you joined", () => {
    setHighlights([{ id: 1, text: "old news" }]);
    render(<EventStrip />);
    expect(screen.queryByText("old news")).toBeNull();
  });

  it("shows new moments for 6 seconds, each batch on its own clock", () => {
    setHighlights([]);
    render(<EventStrip />);
    setHighlights([{ id: 1, text: "💰 BOUNTY!" }]);
    expect(screen.getByText("💰 BOUNTY!")).toBeTruthy();

    act(() => { vi.advanceTimersByTime(4000); });
    setHighlights([{ id: 1, text: "💰 BOUNTY!" }, { id: 2, text: "🪙 toll" }]);
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.queryByText("💰 BOUNTY!")).toBeNull(); // the first batch expired on time
    expect(screen.getByText("🪙 toll")).toBeTruthy();

    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText("🪙 toll")).toBeNull();
  });

  it("shows at most three at once", () => {
    setHighlights([]);
    render(<EventStrip />);
    setHighlights([1, 2, 3, 4, 5].map(id => ({ id, text: `event ${id}` })));
    expect(screen.queryByText("event 2")).toBeNull();
    expect(screen.getByText("event 5")).toBeTruthy();
    expect(screen.getAllByText(/event/)).toHaveLength(3);
  });
});
