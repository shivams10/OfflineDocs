import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client.js";
import { deleteDoc } from "./docs.js";

/**
 * schema.prisma declares `onDelete: Cascade` on DocDraft and DocPresence
 * (master spec line 546). Referential actions are enforced by Postgres, so
 * this can only be observed at the database, not by mocking Prisma.
 */
describe("deleteDoc — cascades draft backups and presence rows [AC-141]", () => {
  let ownerId: string;
  let editorId: string;
  let docId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `ts12-owner-${randomUUID()}@example.test`,
        googleId: `ts12-owner-google-${randomUUID()}`,
        name: "TS-12 owner",
      },
    });
    ownerId = owner.id;

    const editor = await prisma.user.create({
      data: {
        email: `ts12-editor-${randomUUID()}@example.test`,
        googleId: `ts12-editor-google-${randomUUID()}`,
        name: "TS-12 editor",
      },
    });
    editorId = editor.id;

    const doc = await prisma.doc.create({
      data: {
        title: "TS-12 fixture document",
        ownerId,
        collaborators: {
          create: [
            { userId: ownerId, role: "owner" },
            { userId: editorId, role: "editor" },
          ],
        },
      },
    });
    docId = doc.id;

    await prisma.docDraft.createMany({
      data: [
        { docId, userId: ownerId, update: Buffer.from("owner draft") },
        { docId, userId: editorId, update: Buffer.from("editor draft") },
      ],
    });

    // DocPresence.lastSeenAt is @updatedAt-managed, no explicit value needed.
    await prisma.docPresence.createMany({
      data: [
        { docId, userId: ownerId },
        { docId, userId: editorId },
      ],
    });
  });

  afterAll(async () => {
    // The doc itself is gone by the time the test runs — only the users remain.
    await prisma.user
      .deleteMany({ where: { id: { in: [ownerId, editorId] } } })
      .catch(() => {});
  });

  it("leaves zero DocDraft and DocPresence rows for the doc once it is deleted", async () => {
    expect(await prisma.docDraft.count({ where: { docId } })).toBe(2);
    expect(await prisma.docPresence.count({ where: { docId } })).toBe(2);

    await deleteDoc(docId);

    expect(await prisma.docDraft.count({ where: { docId } })).toBe(0);
    expect(await prisma.docPresence.count({ where: { docId } })).toBe(0);
  });
});
