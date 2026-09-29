/** Proposal photo key -> Unsplash photo id (artifact `IMID`). */
const U = (id: string) => `https://unsplash.com/photos/${id}`;

export const ALBA_PHOTO_SOURCES: Readonly<Record<string, string>> = {
  hero: U("1754799670312-8e7da8e40ad7"),
  lashclose: U("1683719312734-e31de63957ab"),
  portrait: U("1611451444023-7fe9d86fe1d0"),
  lasheye: U("1639629509821-c54cdd984227"),
  lashapply: U("1589710751893-f9a6770ad71b"),
  lashlift: U("1674049406467-824ea37c7184"),
  lashwork: U("1718720410649-7524fcb0f0a5"),
  russian: U("1754799670410-b282791342c3"),
  gel: U("1612887390768-fb02affea7a6"),
  acrylic: U("1772322586785-3a34772cbc61"),
  nailart: U("1519014816548-bf5fe059798b"),
  glitter: U("1607779097040-26e80aa78e66"),
  bridal: U("1736434518489-0eb84070017f"),
};
