import type { Category, Lab, Test, UiStrings } from '../models/types';

export type ContentBundle = {
  labs: Lab[];
  categories: Category[];
  tests: Test[];
  ui: UiStrings | null;
};

let content: ContentBundle = { labs: [], categories: [], tests: [], ui: null };

export function setContentBundle(next: ContentBundle): void {
  content = next;
}

export function getContentBundle(): ContentBundle {
  return content;
}
