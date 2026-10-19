/**
 * PostWriter (Posts v1, TUL-1006 / TUL-1007): add a block, autosave, and the
 * upgrade gate that keeps the draft.
 * Run: npx vitest run test/components/posts/PostWriter.test.tsx
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostWriterActions, WriterPostData } from "@/lib/cms/post-writer-types";
import type { PostWriterActionResult } from "@/lib/server-actions/posts-writer-actions";

// The media picker pulls in the whole library UI; the writer only needs "pick a url".
vi.mock("@/components/posts/writer/PostImageField", () => ({
  PostImageField: ({ emptyLabel, onChange }: { emptyLabel: string; onChange: (v: { url: string; alt: string } | null) => void }): ReactNode => (
    <button type="button" onClick={() => onChange({ url: "https://example.com/p.jpg", alt: "foto" })}>
      {emptyLabel}
    </button>
  ),
}));

import { POST_AUTOSAVE_MS, PostWriter } from "@/components/posts/writer/PostWriter";

const POST: WriterPostData = {
  id: "post-1",
  locale: "es",
  status: "draft",
  slug: "mi-post",
  title: "",
  excerpt: "",
  blocks: [],
  publishedAt: null,
  scheduledPublishAt: null,
  categoryId: null,
  isFeatured: false,
  isUnlisted: false,
  expiresAt: null,
  relatedOfferingId: null,
  metaTitle: null,
  metaDescription: null,
  coverImageUrl: null,
  coverImageAlt: null,
  ogImageUrl: null,
  noindex: false,
  takenDownReason: null,
  takenDown: false,
  updatedAt: null,
};

function okRecord(status: string): PostWriterActionResult {
  return {
    ok: true,
    data: {
      id: POST.id,
      status,
      slug: POST.slug,
      locale: POST.locale,
      publishedAt: null,
      scheduledPublishAt: null,
      updatedAt: "2026-10-14T12:00:00.000Z",
    },
  };
}

function makeActions() {
  const save = vi.fn<PostWriterActions["save"]>(async () => okRecord("draft"));
  const updateSettings = vi.fn<PostWriterActions["updateSettings"]>(async () => okRecord("draft"));
  const publish = vi.fn<PostWriterActions["publish"]>(async () => okRecord("published"));
  const unpublish = vi.fn<PostWriterActions["unpublish"]>(async () => okRecord("draft"));
  const actions: PostWriterActions = { save, updateSettings, publish, unpublish };
  return { actions, save, updateSettings, publish, unpublish };
}

function renderWriter(actions: PostWriterActions, post: WriterPostData = POST) {
  return render(
    <PostWriter
      post={post}
      actions={actions}
      locale="es"
      offerings={[]}
      categories={[]}
      backHref="/talent/posts"
      upgradeHref="/talent/plan"
    />,
  );
}

describe("PostWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("adds a block from the bottom toolbar", () => {
    const { actions } = makeActions();
    renderWriter(actions);
    expect(screen.queryByTestId("post-block-paragraph")).toBeNull();
    fireEvent.click(screen.getByTestId("add-block-paragraph"));
    expect(screen.getByTestId("post-block-paragraph")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("add-block-faq"));
    expect(screen.getByTestId("post-block-faq")).toBeInTheDocument();
  });

  it("autosaves the typed text after the debounce, once, without an empty title", async () => {
    const { actions, save } = makeActions();
    renderWriter(actions);
    fireEvent.click(screen.getByTestId("add-block-paragraph"));
    fireEvent.change(screen.getByPlaceholderText("Escribe aquí..."), { target: { value: "Hola mundo" } });
    expect(screen.getByTestId("post-save-state")).toHaveTextContent("Guardando...");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_AUTOSAVE_MS - 100);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(save).toHaveBeenCalledTimes(1);
    const call = save.mock.calls[0][0];
    expect(call.id).toBe("post-1");
    expect("title" in call).toBe(false);
    expect(call.bodyBlocks).toEqual([expect.objectContaining({ type: "paragraph", text: "Hola mundo" })]);
    expect(screen.getByTestId("post-save-state")).toHaveTextContent("Guardado");
  });

  it("does not send an incomplete Servicio block", async () => {
    const { actions, save } = makeActions();
    renderWriter(actions);
    fireEvent.click(screen.getByTestId("add-block-service"));
    fireEvent.click(screen.getByTestId("add-block-paragraph"));
    fireEvent.change(screen.getByPlaceholderText("Escribe aquí..."), { target: { value: "Texto" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_AUTOSAVE_MS + 100);
    });
    expect(save).toHaveBeenCalledTimes(1);
    const sent = save.mock.calls[0][0].bodyBlocks as { type: string }[];
    expect(sent.map((b) => b.type)).toEqual(["paragraph"]);
  });

  it("upgrade_required opens the upgrade sheet and keeps the draft", async () => {
    const { actions, publish } = makeActions();
    publish.mockResolvedValueOnce({
      ok: false,
      code: "upgrade_required",
      message: "Publicar posts es parte de Web Office. Tu borrador está guardado.",
      draftSaved: true,
    });
    renderWriter(actions);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Mi primer post" } });
    fireEvent.click(screen.getByTestId("add-block-paragraph"));
    fireEvent.change(screen.getByPlaceholderText("Escribe aquí..."), { target: { value: "Contenido" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    });

    expect(publish).toHaveBeenCalledTimes(1);
    const sent = publish.mock.calls[0][0];
    expect(sent.id).toBe("post-1");
    expect(sent.draft?.title).toBe("Mi primer post");
    expect(sent.draft?.bodyBlocks).toEqual([expect.objectContaining({ text: "Contenido" })]);

    expect(screen.getByTestId("post-upgrade-sheet")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Publica con Oficina Web");
    // The draft is still on screen and counted as saved: nothing was lost.
    expect(screen.getByLabelText("Título")).toHaveValue("Mi primer post");
    expect(screen.getByPlaceholderText("Escribe aquí...")).toHaveValue("Contenido");
    expect(screen.getByTestId("post-save-state")).toHaveTextContent("Guardado");

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByTestId("post-upgrade-sheet")).toBeNull();
  });

  it("a taken-down post is read-only with the Tulala banner", () => {
    const { actions } = makeActions();
    renderWriter(actions, { ...POST, takenDown: true, takenDownReason: "Contenido engañoso" });
    expect(screen.getByTestId("post-takedown-banner")).toHaveTextContent("Oculto por Tulala: Contenido engañoso");
    expect(screen.queryByTestId("add-block-paragraph")).toBeNull();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  });

  it("read_only_lapsed on a live post shows the renew banner", () => {
    const { actions } = makeActions();
    render(
      <PostWriter
        post={{ ...POST, status: "published" }}
        actions={actions}
        locale="es"
        offerings={[]}
        categories={[]}
        backHref="/talent/posts"
        upgradeHref="/talent/plan"
        lapsed
      />,
    );
    const banner = screen.getByTestId("post-lapsed-banner");
    expect(banner).toHaveTextContent("Tu plan ya no incluye posts");
    expect(screen.getByRole("link", { name: "Renovar plan" })).toHaveAttribute("href", "/talent/plan");
  });
});
