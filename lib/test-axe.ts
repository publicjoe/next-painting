import axeCore, { type AxeResults, type RunOptions } from 'axe-core';

/** Runs axe-core against an element. Used by the jsdom component tests. */
export function axe(element: Element, options: RunOptions = {}): Promise<AxeResults> {
  return axeCore.run(element, options);
}
