import { Router, type IRouter } from "express";
import { eq, avg, count } from "drizzle-orm";
import { db, reviewsTable, spotsTable } from "@workspace/db";
import { CreateReviewBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/reviews", async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values(parsed.data)
    .returning();

  const [stats] = await db
    .select({
      avgRating: avg(reviewsTable.rating),
      totalReviews: count(reviewsTable.id),
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.spotId, parsed.data.spotId));

  if (stats) {
    await db
      .update(spotsTable)
      .set({
        rating: stats.avgRating ?? null,
        totalReviews: Number(stats.totalReviews),
      })
      .where(eq(spotsTable.id, parsed.data.spotId));
  }

  res.status(201).json(review);
});

export default router;
