import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocCollaboratorDto, DocSummary } from "@docsync/shared";
import { DOC_DRAWER_LABELS } from "@/constants/labels";
import { DocumentDetailsDrawer } from "@/components/documents/document-details-drawer";
import { DOCS_QUERY_KEY } from "@/lib/documents/use-documents";
import { fetchCollaborators } from "@/lib/api/collaborators";

// document-details-drawer.tsx calls useRouter() (the footer's "Open" button) —
// only `push` is exercised there, which neither TS-9 nor TS-10 triggers. See
// the same note in document-table.test.tsx, the first suite to mock this.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/collaborators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/collaborators")>();
  return {
    ...actual,
    fetchCollaborators: vi.fn(),
  };
});

const collaboratorsFetch = vi.mocked(fetchCollaborators);

function makeDoc(overrides: Partial<DocSummary> & { id: string }): DocSummary {
  return {
    title: "A shared document",
    ownerId: "owner-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    role: "owner",
    collaborators: [],
    ...overrides,
  };
}

function collaborator(overrides: Partial<DocCollaboratorDto> & { userId: string }): DocCollaboratorDto {
  return {
    name: null,
    email: null,
    avatarUrl: null,
    role: "editor",
    ...overrides,
  };
}

function renderDrawer(doc: DocSummary) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(DOCS_QUERY_KEY, [doc]);

  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentDetailsDrawer
        docId={doc.id}
        currentUserId="viewer-user"
        isDirty={false}
        onClose={vi.fn()}
        onManageAccess={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  collaboratorsFetch.mockReset();
});

describe("DocumentDetailsDrawer — viewer sees no members and no request is made [AC-19]", () => {
  it("hides the Members section and the Owner row, and never calls the collaborators fetcher", async () => {
    const doc = makeDoc({ id: "doc-viewer", role: "viewer" });
    renderDrawer(doc);

    // Wait for the drawer body (a field that is always present) before
    // asserting an absence, or the absence proves nothing.
    expect(await screen.findByText(DOC_DRAWER_LABELS.status)).toBeInTheDocument();

    expect(screen.queryByText(DOC_DRAWER_LABELS.members)).not.toBeInTheDocument();
    expect(screen.queryByText(DOC_DRAWER_LABELS.owner)).not.toBeInTheDocument();

    expect(screen.getByText(DOC_DRAWER_LABELS.yourRole)).toBeInTheDocument();
    expect(screen.getByText(DOC_DRAWER_LABELS.created)).toBeInTheDocument();
    expect(screen.getByText(DOC_DRAWER_LABELS.updated)).toBeInTheDocument();

    expect(collaboratorsFetch).not.toHaveBeenCalled();
  });
});

describe("DocumentDetailsDrawer — editor still sees the owner row and member list [AC-20]", () => {
  it("shows the Owner row naming the owner and lists both members", async () => {
    collaboratorsFetch.mockResolvedValue([
      collaborator({ userId: "owner-1", name: "Olivia Owner", role: "owner" }),
      collaborator({ userId: "editor-2", name: "Eve Editor", role: "editor" }),
    ]);

    const doc = makeDoc({ id: "doc-editor", role: "editor" });
    renderDrawer(doc);

    // The Members section itself renders synchronously with an empty list
    // (canSeeMembers only gates whether the fetch fires), so wait on the
    // collaborators query actually settling, not on the section appearing.
    await screen.findByText("Eve Editor");

    // "Owner" also appears as the RoleChip badge text on the owner's row in
    // the member list below, so pick the drawer's own label span (not the
    // badge) rather than assuming a single match.
    const ownerLabel = screen
      .getAllByText(DOC_DRAWER_LABELS.owner)
      .find((el) => el.dataset.slot !== "badge")!;
    const ownerRow = ownerLabel.closest("div")!;
    expect(ownerRow).toHaveTextContent("Olivia Owner");

    // The Members section lists both collaborators too (Olivia Owner appears
    // a second time there, alongside the drawer's own Owner row).
    expect(screen.getAllByText("Olivia Owner")).toHaveLength(2);
    expect(collaboratorsFetch).toHaveBeenCalledWith(doc.id);
  });
});
