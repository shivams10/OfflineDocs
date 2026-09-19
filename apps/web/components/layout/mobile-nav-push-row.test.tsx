import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_SHELL_LABELS, PUSH_LABELS } from "@/constants/labels";
import { MobileNavPushRow } from "@/components/layout/mobile-nav-push-row";
import { usePush, type PushStatus } from "@/lib/push/use-push";

vi.mock("@/lib/push/use-push", () => ({
  usePush: vi.fn(),
}));

const push = vi.mocked(usePush);

function pushState(status: PushStatus) {
  return { status, enable: vi.fn(), disable: vi.fn() };
}

describe("MobileNavPushRow — the row only appears where push can actually work [AC-23][AC-24]", () => {
  it("shows the Notifications label and a toggle button when push is off but usable", () => {
    push.mockReturnValue(pushState("off"));
    render(<MobileNavPushRow />);

    expect(screen.getByText(APP_SHELL_LABELS.notifications)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: PUSH_LABELS.enable }),
    ).toBeInTheDocument();
  });

  it("renders nothing at all — label included — when push is unavailable", () => {
    push.mockReturnValue(pushState("unavailable"));
    render(<MobileNavPushRow />);

    expect(screen.queryByText(APP_SHELL_LABELS.notifications)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing at all — label included — while still checking", () => {
    push.mockReturnValue(pushState("checking"));
    render(<MobileNavPushRow />);

    expect(screen.queryByText(APP_SHELL_LABELS.notifications)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
