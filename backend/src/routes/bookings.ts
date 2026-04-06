import { Router, type IRouter } from "express";
import { eq, and, desc, or, lte, gte, lt, gt, count } from "drizzle-orm";
import { db, bookingsTable, spotsTable } from "@workspace/db";
import { updateBookingStatuses } from "../lib/tasks";
import {
  ListBookingsQueryParams,
  CreateBookingBody,
  GetBookingParams,
  UpdateBookingParams,
  UpdateBookingBody,
} from "@workspace/api-zod";
import { ne } from "drizzle-orm";

const router: IRouter = Router();

router.get("/bookings", async (req, res): Promise<void> => {
  await updateBookingStatuses();
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  const conditions = [];

  if (parsed.success) {
    const { userId, spotId, status } = parsed.data;
    if (userId) conditions.push(eq(bookingsTable.userId, Number(userId)));
    if (spotId) conditions.push(eq(bookingsTable.spotId, Number(spotId)));
    if (status) conditions.push(eq(bookingsTable.status, status));
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt));

  res.json(bookings);
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const spot = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.id, parsed.data.spotId));

  if (!spot[0]) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }

  const requestedStart = new Date(parsed.data.startTime);
  const requestedEnd = new Date(parsed.data.endTime);

  // Check for overlaps with existing confirmed/completed bookings
  // A booking overlaps if: (ExistingStart < RequestedEnd) AND (ExistingEnd > RequestedStart)
  const overlappingBookings = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.spotId, parsed.data.spotId),
        ne(bookingsTable.status, "cancelled"), // Consider both confirmed and completed
        lt(bookingsTable.startTime, requestedEnd),
        gt(bookingsTable.endTime, requestedStart)
      )
    );

  const overlapCount = overlappingBookings.length;

  console.log(`[Overlap Audit] SpotID: ${parsed.data.spotId}, Name: "${spot[0].name}"`);
  console.log(`[Overlap Audit] Requested Range: ${requestedStart.toLocaleString()} - ${requestedEnd.toLocaleString()} (UTC: ${requestedStart.toISOString()})`);
  console.log(`[Overlap Audit] Spot Capacity: ${spot[0].totalSlots} slots`);
  console.log(`[Overlap Audit] Found overlaps: ${overlapCount}`);
  
  if (overlapCount > 0) {
    overlappingBookings.forEach(b => {
      console.log(`  - Existing Booking ID ${b.id}: ${b.startTime.toLocaleString()} - ${b.endTime.toLocaleString()}`);
    });
  }

  if (overlapCount >= spot[0].totalSlots) {
    console.log(`[Overlap Audit] REJECTED: Slot is full (Capacity: ${spot[0].totalSlots}, Overlaps: ${overlapCount})`);
    res.status(400).json({ error: "The chosen time slot is already booked. Please select a different time." });
    return;
  }

  const spotName = spot[0]?.name ?? null;

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      ...parsed.data,
      startTime: requestedStart,
      endTime: requestedEnd,
      spotName,
      status: "confirmed",
      paymentStatus: "pending",
    })
    .returning();

  res.status(201).json(booking);
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  await updateBookingStatuses();
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(booking);
});

router.patch("/bookings/:id", async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const [booking] = await db
    .update(bookingsTable)
    .set(parsed.data)
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  res.json(booking);
});

export default router;
