import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { projectsRouter } from "../routes/projects";
import { pool } from "../db";
import * as projectKeyGen from "../lib/project-key";

vi.mock("../db", () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("../lib/project-key", () => ({
  generateUniqueProjectKey: vi.fn(),
}));

describe("Projects API", () => {
  const app = new Hono().route("/projects", projectsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /projects", () => {
    it("should return all projects for the owner", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          { id: "proj_1", name: "App 1", public_key: "pk_1", created_at: "17000" },
        ],
        rowCount: 1,
      } as any);

      const res = await app.request("/projects");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual([
        { id: "proj_1", name: "App 1", publicKey: "pk_1", createdAt: 17000 },
      ]);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, name"),
        ["usr_playground"]
      );
    });
  });

  describe("GET /projects/:id", () => {
    it("should return project details if it exists", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          { id: "proj_2", name: "App 2", public_key: "pk_2", created_at: "17001" },
        ],
        rowCount: 1,
      } as any);

      const res = await app.request("/projects/proj_2");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(
        { id: "proj_2", name: "App 2", publicKey: "pk_2", createdAt: 17001 }
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1 AND owner_id = $2"),
        ["proj_2", "usr_playground"]
      );
    });

    it("should return 404 if project is missing or unauthorized", async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const res = await app.request("/projects/proj_missing");
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Not Found");
    });
  });

  describe("POST /projects", () => {
    it("should create a new project and return it", async () => {
      vi.mocked(projectKeyGen.generateUniqueProjectKey).mockResolvedValueOnce("pk_live_test");
      vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1 } as any);

      const res = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Startup" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toMatchObject({
        name: "My Startup",
        publicKey: "pk_live_test",
      });
      expect(json.data.id).toMatch(/^proj_/);
    });

    it("should validate the payload (empty name)", async () => {
      const res = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }), // trim becomes empty
      });
      expect(res.status).toBe(400); // zod validation error
    });
  });
});
