import type { OneThoughtApi } from "../main/preload";

declare global {
  interface Window {
    oneThought: OneThoughtApi;
  }
}

export {};
