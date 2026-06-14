import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import invitationsRouter from "./invitations";
import usersRouter from "./users";
import bootstrapRouter from "./bootstrap";
import auditRouter from "./audit";
import rolesRouter from "./roles";
import domainsRouter from "./domains";
import degreesRouter from "./degrees";
import configAdminRouter from "./config-admin";
import birthdaysRouter from "./birthdays";
import roadmapRouter from "./roadmap";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/invitations", invitationsRouter);
router.use("/users", usersRouter);
router.use("/bootstrap", bootstrapRouter);
router.use("/audit", auditRouter);
router.use("/roles", rolesRouter);
router.use("/domains", domainsRouter);
router.use("/degree-definitions", degreesRouter);
router.use("/config", configAdminRouter);
router.use("/birthdays", birthdaysRouter);
router.use("/roadmap", roadmapRouter);

export default router;
