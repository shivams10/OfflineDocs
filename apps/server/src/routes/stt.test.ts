import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { env, STT_MAX_AUDIO_BYTES } from "../config/env.js";
import { prisma } from "../db/client.js";
import { signAccessToken } from "../lib/jwt.js";
import { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER } from "../lib/cookies.js";

// requireCsrfToken only compares the cookie and header for equality.
const CSRF_VALUE = "stt-route-csrf";
const AUDIO = Buffer.from("fake-opus-bytes");
const WEBM = "audio/webm;codecs=opus";

function withSession(req: request.Test, token: string): request.Test {
  return req
    .set("Cookie", [`${ACCESS_TOKEN_COOKIE}=${token}`, `${CSRF_COOKIE}=${CSRF_VALUE}`])
    .set(CSRF_HEADER, CSRF_VALUE);
}

async function makeUser(tag: string) {
  const email = `stt-route-${tag}-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: { email, googleId: `stt-route-${tag}-${randomUUID()}`, name: `STT ${tag}` },
  });
  return { id: user.id, token: await signAccessToken({ sub: user.id, email }) };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /docs/:id/transcribe", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let editor: Awaited<ReturnType<typeof makeUser>>;
  let viewer: Awaited<ReturnType<typeof makeUser>>;
  let outsider: Awaited<ReturnType<typeof makeUser>>;
  let docId: string;

  const fetchMock = vi.spyOn(globalThis, "fetch");

  beforeAll(async () => {
    [owner, editor, viewer, outsider] = await Promise.all([
      makeUser("owner"),
      makeUser("editor"),
      makeUser("viewer"),
      makeUser("outsider"),
    ]);
    const doc = await prisma.doc.create({
      data: {
        title: "STT fixture",
        ownerId: owner.id,
        collaborators: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: editor.id, role: "editor" },
            { userId: viewer.id, role: "viewer" },
          ],
        },
      },
    });
    docId = doc.id;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  afterAll(async () => {
    fetchMock.mockRestore();
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, editor.id, viewer.id, outsider.id] } },
    });
  });

  function transcribe(token: string, audio: Buffer = AUDIO, contentType = WEBM) {
    return withSession(request(app).post(`/docs/${docId}/transcribe`), token).attach(
      "audio",
      audio,
      { filename: "dictation.webm", contentType },
    );
  }

  it("forwards an editor's audio to the STT service and returns the transcript", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { transcript: "hello world" }));

    const res = await transcribe(editor.token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ transcript: "hello world" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${env.STT_URL}/transcribe`);
    const sent = (init?.body as FormData).get("audio") as Blob;
    // Parameters like `;codecs=opus` may be normalised away; the base type is what apps/stt checks.
    expect(sent.type.split(";")[0]).toBe("audio/webm");
    expect(Buffer.from(await sent.arrayBuffer()).equals(AUDIO)).toBe(true);
  });

  it("allows the owner and accepts Ogg audio", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { transcript: "ok" }));

    const res = await transcribe(owner.token, AUDIO, "audio/ogg");

    expect(res.status).toBe(200);
  });

  it("returns 403 for a viewer without contacting the STT service", async () => {
    const res = await transcribe(viewer.token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-collaborator without contacting the STT service", async () => {
    const res = await transcribe(outsider.token);

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    const res = await request(app)
      .post(`/docs/${docId}/transcribe`)
      .set("Cookie", [`${CSRF_COOKIE}=${CSRF_VALUE}`])
      .set(CSRF_HEADER, CSRF_VALUE)
      .attach("audio", AUDIO, { filename: "a.webm", contentType: WEBM });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 403 without the CSRF header", async () => {
    const res = await request(app)
      .post(`/docs/${docId}/transcribe`)
      .set("Cookie", [`${ACCESS_TOKEN_COOKIE}=${editor.token}`, `${CSRF_COOKIE}=${CSRF_VALUE}`])
      .attach("audio", AUDIO, { filename: "a.webm", contentType: WEBM });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("csrf_token_invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415 for a non-WebM/Ogg type", async () => {
    const res = await transcribe(editor.token, AUDIO, "audio/mpeg");

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("unsupported_audio_type");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 413 for audio over the 10 MB cap", async () => {
    const res = await transcribe(editor.token, Buffer.alloc(STT_MAX_AUDIO_BYTES + 1));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("audio_too_large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no audio file is attached", async () => {
    const res = await withSession(request(app).post(`/docs/${docId}/transcribe`), editor.token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("audio_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [503, "stt_busy", 503],
    [413, "audio_too_long", 413],
    [422, "audio_unreadable", 422],
  ])("maps an STT %i %s to %i with the same code", async (sttStatus, code, expected) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sttStatus, { error: { code, message: "x" } }));

    const res = await transcribe(editor.token);

    expect(res.status).toBe(expected);
    expect(res.body.error.code).toBe(code);
  });

  it("hides an unexpected STT failure behind 503 stt_unavailable", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    fetchMock.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

    const res = await transcribe(editor.token);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("stt_unavailable");
    expect(JSON.stringify(res.body)).not.toContain("Internal Server Error");
  });

  it("returns 503 stt_unavailable when the STT service is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const res = await transcribe(editor.token);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("stt_unavailable");
  });

  it("returns 503 when the STT service answers 200 with a malformed body", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { text: "wrong key" }));

    const res = await transcribe(editor.token);

    expect(res.status).toBe(503);
  });
});
