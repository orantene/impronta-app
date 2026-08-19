import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectVideoUrls,
  describeUnembeddable,
  youtubeIdFromUrl,
} from "./video-embed-preflight";

test("ids come out of every URL shape an author might paste", () => {
  for (const [url, id] of [
    ["https://www.youtube.com/watch?v=c9ARKE2WNxA", "c9ARKE2WNxA"],
    ["https://youtu.be/c9ARKE2WNxA", "c9ARKE2WNxA"],
    ["https://www.youtube-nocookie.com/embed/c9ARKE2WNxA", "c9ARKE2WNxA"],
    ["https://www.youtube.com/watch?list=PL1&v=c9ARKE2WNxA", "c9ARKE2WNxA"],
  ] as const) {
    assert.equal(youtubeIdFromUrl(url), id, url);
  }
  assert.equal(youtubeIdFromUrl("https://vimeo.com/12345"), null);
});

test("only background videos are collected, never image srcs", () => {
  // `src` is also the image node's prop. Treating one as a video would send a
  // photo URL to YouTube's oembed and fail the seed for no reason.
  const tree = [
    {
      id: "hero",
      props: {
        backgroundMedia: { source: "youtube", src: "https://youtu.be/abc123" },
      },
      children: [
        { id: "img", kind: "image", props: { src: "https://cdn/photo.jpg" } },
      ],
    },
  ];
  assert.deepEqual(collectVideoUrls(tree), ["https://youtu.be/abc123"]);
});

test("the message says how to fix it, not just what is wrong", () => {
  // The operator hitting this cannot act on "403".
  const text = describeUnembeddable([
    { url: "https://youtu.be/abc123", id: "abc123", embeddable: false, status: 403 },
  ]);
  assert.match(text, /Allow embedding/);
  assert.match(text, /YouTube Studio/);
  assert.match(text, /403/);
});

test("an unrecognised URL is reported rather than silently skipped", () => {
  const text = describeUnembeddable([
    { url: "https://vimeo.com/1", id: null, embeddable: false, status: null },
  ]);
  assert.match(text, /not a YouTube URL/);
});
