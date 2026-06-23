import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';

/**
 * Role hierarchy from least to most privileged.
 * A user with a higher-indexed role is authorized for any endpoint
 * that requires a lower-or-equal-indexed role.
 *
 * The DB CHECK constraint on `user_account.user_role_name` is aligned with
 * this list (see migration 019_expand_role_check.sql). Adding a new role
 * here requires a matching ALTER TABLE migration; otherwise inserts will
 * fail at the DB layer with a constraint violation.
 */
export const ROLE_HIERARCHY: readonly string[] = [
  'viewer',
  'submitter',
  'editor',
  'manager',
  'admin',
  'super_admin',
];

/**
 * Legacy role alias map. The user_account table originally allowed only
 * 'user' | 'admin'; SSO-created rows still default to 'user'. We treat the
 * legacy 'user' value as 'viewer' (lowest privilege) so existing rows keep
 * working after the hierarchy was expanded. New writes should always use one
 * of ROLE_HIERARCHY; legacy reads are normalised here on the way in.
 */
const LEGACY_ROLE_ALIAS: Record<string, string> = {
  user: 'viewer',
};

function normaliseRole(stored: string | undefined): string | undefined {
  if (!stored) return undefined;
  return LEGACY_ROLE_ALIAS[stored] ?? stored;
}

/**
 * Authorization middleware factory.
 * Returns middleware that checks if req.user.role meets or exceeds
 * the minimum privilege level implied by any of the allowed roles.
 * Must be used after authenticate middleware.
 *
 * @param roles - Allowed roles (e.g., 'editor', 'admin')
 */
export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    const effectiveRole = normaliseRole(req.user.role);
    const userRoleIndex = effectiveRole ? ROLE_HIERARCHY.indexOf(effectiveRole) : -1;

    // If the user's role is not in the hierarchy, deny access
    if (userRoleIndex === -1) {
      next(AppError.forbidden('Insufficient permissions'));
      return;
    }

    // Allow access if the user's role index >= any of the required roles' indices.
    // Normalise the specified roles through the same legacy alias so that
    // authorize('user') is equivalent to authorize('viewer').
    const minRequiredIndex = Math.min(
      ...roles
        .map((r) => normaliseRole(r))
        .filter((r): r is string => !!r)
        .map((r) => ROLE_HIERARCHY.indexOf(r))
        .filter((i) => i !== -1)
    );

    if (minRequiredIndex === Infinity || userRoleIndex < minRequiredIndex) {
      next(AppError.forbidden('Insufficient permissions'));
      return;
    }

    next();
  };
}
