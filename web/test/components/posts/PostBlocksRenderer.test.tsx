import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PostBody } from "@/components/posts/PostBlocksRenderer";
import { parsePostBlocks } from "@/lib/cms/post-blocks";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("PostBody", () => {
  it("renders the legacy body when blocks are null", () => {
    const { container } = render(<PostBody blocks={null} body={"One\n\nTwo"} />);
    expect(container.querySelectorAll(".site-post__body > p")).toHaveLength(2);
  });

  it("renders blocks, a resolved service, and a privacy embed", () => {
    const blocks = parsePostBlocks([
      { id: "1", type: "heading", text: "Hi", level: 2 },
      { id: "2", type: "service", offering_id: UUID },
      { id: "3", type: "video", url: "https://youtu.be/dQw4w9WgXcQ" },
    ]);
    const { container, getByText } = render(
      <PostBody blocks={blocks} body="" services={{ [UUID]: { name: "Shoot", label: "From $100" } }} />,
    );
    expect(getByText("From $100")).toBeTruthy();
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("youtube-nocookie.com");
  });

  it("renders nothing for a missing service", () => {
    const blocks = parsePostBlocks([{ id: "2", type: "service", offering_id: UUID }]);
    const { container } = render(<PostBody blocks={blocks} body="" services={{}} />);
    expect(container.querySelector(".site-post__block")).toBeNull();
  });
});
