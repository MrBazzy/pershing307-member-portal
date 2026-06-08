import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import invitationsRouter from "./invitations";
import usersRouter from "./users";
import bootstrapRouter from "./bootstrap";
import auditRouter from "./audit";
import rolesRouter from "./roles";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/invitations", invitationsRouter);
router.use("/users", usersRouter);
router.use("/bootstrap", bootstrapRouter);
router.use("/audit-logs", auditRouter);
router.use("/roles", rolesRouter);

export default router;
