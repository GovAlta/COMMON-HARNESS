import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { csrf } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { broadcastRateLimiter } from '../middleware/rate-limit';
import { asyncHandler } from '../utils/async-handler';
import * as adminController from '../controllers/admin.controller';
import * as blogController from '../controllers/blog.controller';
import {
  createPostSchema,
  updatePostSchema,
  listAdminSchema,
  adminIdParamSchema,
} from '../validators/blog.validator';
import {
  dashboardStatsQuerySchema,
  createResourceSchema,
  updateResourceSchema,
  createResourceUpdateSchema,
  createServiceLocationSchema,
  updateServiceLocationSchema,
  createFormSchema,
  updateFormSchema,
  adminSubmissionsQuerySchema,
  updateSubmissionStatusSchema,
  createServiceCatalogueSchema,
  updateServiceCatalogueSchema,
  broadcastNotificationSchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  adminUuidParamSchema,
} from '../validators/admin.validator';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate, authorize('admin'));

// Dashboard
router.get(
  '/dashboard/stats',
  validate(dashboardStatsQuerySchema),
  asyncHandler(adminController.getDashboardStats)
);

// Resource management
//
// Admin GET endpoints return ALL statuses (draft / published / archived) so
// content managers can edit drafts. Public /api/v1/resources hard-codes a
// PUBLIC_STATUSES allow-list that strips drafts; admins use these dedicated
// paths.
router.get(
  '/resources',
  asyncHandler(adminController.listResourcesAdmin)
);

router.get(
  '/resources/:id',
  validate(adminUuidParamSchema),
  asyncHandler(adminController.getResourceAdmin)
);

router.post(
  '/resources',
  csrf,
  validate(createResourceSchema),
  asyncHandler(adminController.createResource)
);

router.put(
  '/resources/:id',
  csrf,
  validate(updateResourceSchema),
  asyncHandler(adminController.updateResource)
);

router.delete(
  '/resources/:id',
  csrf,
  validate(adminUuidParamSchema),
  asyncHandler(adminController.deleteResource)
);

router.post(
  '/resources/:id/clone',
  csrf,
  validate(adminUuidParamSchema),
  asyncHandler(adminController.cloneResource)
);

router.post(
  '/resources/:id/updates',
  csrf,
  validate(createResourceUpdateSchema),
  asyncHandler(adminController.addResourceUpdate)
);

// Service location management
router.post(
  '/service-locations',
  csrf,
  validate(createServiceLocationSchema),
  asyncHandler(adminController.createServiceLocation)
);

router.put(
  '/service-locations/:id',
  csrf,
  validate(updateServiceLocationSchema),
  asyncHandler(adminController.updateServiceLocation)
);

router.delete(
  '/service-locations/:id',
  csrf,
  validate(adminUuidParamSchema),
  asyncHandler(adminController.deleteServiceLocation)
);

// Service catalogue management
router.get(
  '/services',
  asyncHandler(adminController.listServices)
);

router.get(
  '/service-categories',
  asyncHandler(adminController.listServiceCategories)
);

router.post(
  '/services',
  csrf,
  validate(createServiceCatalogueSchema),
  asyncHandler(adminController.createService)
);

router.put(
  '/services/:id',
  csrf,
  validate(updateServiceCatalogueSchema),
  asyncHandler(adminController.updateService)
);

router.post(
  '/services/:id/clone',
  csrf,
  validate(adminUuidParamSchema),
  asyncHandler(adminController.cloneService)
);

// Form management
router.get(
  '/forms',
  asyncHandler(adminController.listForms)
);

router.post(
  '/forms',
  csrf,
  validate(createFormSchema),
  asyncHandler(adminController.createForm)
);

router.put(
  '/forms/:id',
  csrf,
  validate(updateFormSchema),
  asyncHandler(adminController.updateForm)
);

router.delete(
  '/forms/:id',
  csrf,
  validate(adminUuidParamSchema),
  asyncHandler(adminController.deleteForm)
);

router.post(
  '/forms/:id/clone',
  csrf,
  validate(adminUuidParamSchema),
  asyncHandler(adminController.cloneForm)
);

// Submission management
router.get(
  '/submissions',
  validate(adminSubmissionsQuerySchema),
  asyncHandler(adminController.listAllSubmissions)
);

router.get(
  '/submissions/:id',
  validate(adminUuidParamSchema),
  asyncHandler(adminController.getSubmissionDetail)
);

router.put(
  '/submissions/:id/status',
  csrf,
  validate(updateSubmissionStatusSchema),
  asyncHandler(adminController.updateSubmissionStatus)
);

// Notification management
router.get(
  '/notifications',
  asyncHandler(adminController.listBroadcasts)
);

router.post(
  '/notifications/broadcast',
  broadcastRateLimiter,
  csrf,
  validate(broadcastNotificationSchema),
  asyncHandler(adminController.broadcastNotification)
);

// User management
router.get(
  '/users',
  validate(listUsersQuerySchema),
  asyncHandler(adminController.listUsers)
);

router.put(
  '/users/:id/role',
  csrf,
  validate(updateUserRoleSchema),
  asyncHandler(adminController.updateUserRole)
);

router.put(
  '/users/:id/status',
  csrf,
  validate(updateUserStatusSchema),
  asyncHandler(adminController.updateUserStatus)
);

router.delete(
  '/users/:id',
  csrf,
  validate(adminUuidParamSchema),
  asyncHandler(adminController.deleteUser)
);

// Blog management
router.get(
  '/blog',
  validate(listAdminSchema),
  asyncHandler(blogController.listAllAdmin)
);

router.get(
  '/blog/:id',
  validate(adminIdParamSchema),
  asyncHandler(blogController.getByIdAdmin)
);

router.post(
  '/blog',
  csrf,
  validate(createPostSchema),
  asyncHandler(blogController.createAdmin)
);

router.put(
  '/blog/:id',
  csrf,
  validate(updatePostSchema),
  asyncHandler(blogController.updateAdmin)
);

router.delete(
  '/blog/:id',
  csrf,
  validate(adminIdParamSchema),
  asyncHandler(blogController.deleteAdmin)
);

router.post(
  '/blog/:id/clone',
  csrf,
  validate(adminIdParamSchema),
  asyncHandler(blogController.cloneAdmin)
);

export default router;
