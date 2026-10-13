import {
  render as baseRender,
  type RenderOptions,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createQueryClient } from "../src/queries";
export function render(ui: ReactElement, options?: RenderOptions) {
  const client = createQueryClient();
  return baseRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    ...options,
  });
}
