import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("answers 200 with status ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("does not reveal the framework", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("answers 404 for an unknown route", async () => {
    const res = await request(createApp()).get("/nope");
    expect(res.status).toBe(404);
  });
});