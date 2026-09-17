import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/require-role.js";
import * as collaboratorsController from "../controllers/collaborators.js";
import {
  changeRoleSchema,
  inviteCollaboratorSchema,
} from "../validators/collaborators.js";
import { validate } from "../middleware/validate.js";

export const collaboratorsRouter = Router({ mergeParams: true });

collaboratorsRouter.use(requireAuth);

// Editor+, not viewer+: the role matrix (master spec §2) gives viewers no sight of the
// member list or anyone's role. Emails are narrowed again inside the controller, to owners
// only — role decides whether you see the list at all, and then how much of each row.
collaboratorsRouter.get(
  "/",
  requireRole("editor"),
  collaboratorsController.list,
);

collaboratorsRouter.post(
  "/",
  requireRole("owner"),
  validate("body", inviteCollaboratorSchema),
  collaboratorsController.invite,
);

collaboratorsRouter.patch(
  "/:userId",
  requireRole("owner"),
  validate("body", changeRoleSchema),
  collaboratorsController.changeRoleHandler,
);

collaboratorsRouter.delete(
  "/:userId",
  requireRole("viewer"),
  collaboratorsController.remove,
);
