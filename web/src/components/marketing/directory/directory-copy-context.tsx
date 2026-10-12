"use client";

import { createContext, useContext } from "react";

import { DIRECTORY_COPY_EN, type DirectoryCopy } from "./directory-copy";

const DirectoryCopyContext = createContext<DirectoryCopy>(DIRECTORY_COPY_EN);

export const DirectoryCopyProvider = DirectoryCopyContext.Provider;

export function useDirectoryCopy(): DirectoryCopy {
  return useContext(DirectoryCopyContext);
}
