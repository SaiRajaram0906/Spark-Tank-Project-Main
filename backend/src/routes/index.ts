import { Router, type IRouter } from "express";
import healthRouter from "./health";
import spotsRouter from "./spots";
import bookingsRouter from "./bookings";
import usersRouter from "./users";
import reviewsRouter from "./reviews";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(spotsRouter);
router.use(bookingsRouter);
router.use(usersRouter);
router.use(reviewsRouter);
router.use(dashboardRouter);

export default router;
