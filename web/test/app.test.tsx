import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import App from "../src/App";

describe("App", () => {
  it("renders the system name", () => {
    expect(renderToString(<App />)).toContain("IYANU-OLUWA Cooperative Management System");
  });
});
