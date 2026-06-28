import { Request, Response, NextFunction } from 'express';
import { sendForbidden } from '../utils/response';

type Role = 'admin' | 'supervisor' | 'operator' | 'viewer';

const ROLE_HIERARCHY: Record<Role, number> = {
  admin:      4,
  supervisor: 3,
  operator:   2,
  viewer:     1,
};

// Usage: requireRole('admin') — only admin can access
// Usage: requireMinRole('supervisor') — supervisor and above
export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { sendForbidden(res); return; }
    if (!roles.includes(req.user.role as Role)) {
      sendForbidden(res, `Required role: ${roles.join(' or ')}`);
      return;
    }
    next();
  };
};

export const requireMinRole = (minRole: Role) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { sendForbidden(res); return; }
    const userLevel = ROLE_HIERARCHY[req.user.role as Role] ?? 0;
    const minLevel  = ROLE_HIERARCHY[minRole];
    if (userLevel < minLevel) {
      sendForbidden(res, `Minimum required role: ${minRole}`);
      return;
    }
    next();
  };
};
