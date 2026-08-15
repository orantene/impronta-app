import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TALENT_DOCUMENT_BUCKET, isTalentDocumentRef } from "./talent-document-ref";

const TALENT = "b887957d-abfc-4366-ae43-9ca5762571d9";
const OTHER_TALENT = "53fa6183-1c6d-4d8e-9805-b1cc4d284a4b";

describe("isTalentDocumentRef — the read/delete side of the document path contract", () => {
  it("accepts the exact shape both upload paths produce", () => {
    assert.equal(
      isTalentDocumentRef(TALENT_DOCUMENT_BUCKET, `${TALENT}/documents/abc123.pdf`, TALENT),
      true,
    );
  });

  it("refuses another talent's documents prefix", () => {
    assert.equal(
      isTalentDocumentRef(TALENT_DOCUMENT_BUCKET, `${OTHER_TALENT}/documents/abc.pdf`, TALENT),
      false,
    );
  });

  it("refuses arbitrary paths in the same bucket (the reported hole)", () => {
    assert.equal(
      isTalentDocumentRef(TALENT_DOCUMENT_BUCKET, `${OTHER_TALENT}/card/original.jpg`, TALENT),
      false,
    );
  });

  it("refuses any other bucket, even with a well-shaped path", () => {
    assert.equal(
      isTalentDocumentRef("media-public", `${TALENT}/documents/abc.pdf`, TALENT),
      false,
    );
  });

  it("refuses path traversal inside a well-shaped prefix", () => {
    assert.equal(
      isTalentDocumentRef(
        TALENT_DOCUMENT_BUCKET,
        `${TALENT}/documents/../../${OTHER_TALENT}/documents/x.pdf`,
        TALENT,
      ),
      false,
    );
  });

  it("refuses an empty talent id rather than matching '/documents/…'", () => {
    assert.equal(isTalentDocumentRef(TALENT_DOCUMENT_BUCKET, "/documents/x.pdf", ""), false);
  });
});
