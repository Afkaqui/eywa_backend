import { Hono } from "hono";
import { authMiddleware } from "@/middleware/auth";
import { getRequestUser } from "@/lib/auth-helpers";
import { EsgRepository } from "../repositories/esg-repository";

const app = new Hono();
const esgRepo = new EsgRepository();

// Apply auth middleware to all routes
app.use("*", authMiddleware);

// GET /api/esg - get current user ESG scores + history
app.get("/", async (c) => {
  const user = getRequestUser(c);

  const [score, history] = await Promise.all([
    esgRepo.getByUser(user.sub),
    esgRepo.getHistory(user.sub),
  ]);

  return c.json({
    esgScore: score,
    history,
  });
});

// PUT /api/esg - save/update scores
app.put("/", async (c) => {
  const user = getRequestUser(c);

  const body = await c.req.json<{ scores: Record<string, number> }>();
  if (!body.scores || typeof body.scores !== "object") {
    return c.json({ error: "scores is required" }, 400);
  }

  const updated = await esgRepo.upsert(user.sub, body.scores);
  // Also save to history
  await esgRepo.addHistory(user.sub, body.scores);

  return c.json({ esgScore: updated });
});

export default app;
