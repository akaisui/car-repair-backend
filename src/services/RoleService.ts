import { User } from '../types';

/**
 * Role-based access control service
 */
export default class RoleService {
  // Role hierarchy levels (higher number = more permissions)
  private static readonly ROLE_LEVELS = {
    customer: 1,
    staff: 2,
    admin: 3,
  } as const;

  // Permission groups by role
  private static readonly ROLE_PERMISSIONS = {
    customer: [
      // Profile management
      'profile:read',
      'profile:update',
      'password:change',

      // Appointments
      'appointments:read_own',
      'appointments:create',
      'appointments:update_own',
      'appointments:cancel_own',

      // Services (public)
      'services:read',
      'services:list',

      // Reviews
      'reviews:create_own',
      'reviews:read_own',
      'reviews:update_own',

      // Vehicles
      'vehicles:read_own',
      'vehicles:create_own',
      'vehicles:update_own',
      'vehicles:delete_own',

      // Invoices (own)
      'invoices:read_own',

      // Loyalty points
      'loyalty:read_own',
    ],

    staff: [
      // Inherit customer permissions
      ...([
        'profile:read',
        'profile:update',
        'password:change',
        'services:read',
        'services:list',
      ]),

      // Appointments management
      'appointments:read_all',
      'appointments:create',
      'appointments:update_all',
      'appointments:cancel_all',
      'appointments:assign',

      // Customer management
      'customers:read_all',
      'customers:create',
      'customers:update',
      'customers:search',

      // Services management
      'services:create',
      'services:update',
      'services:delete',

      // Parts inventory
      'parts:read_all',
      'parts:create',
      'parts:update',
      'parts:delete',
      'parts:stock_update',

      // Repairs management
      'repairs:read_all',
      'repairs:create',
      'repairs:update_all',
      'repairs:complete',

      // Invoices
      'invoices:read_all',
      'invoices:create',
      'invoices:update',

      // Reviews management
      'reviews:read_all',
      'reviews:respond',

      // Reports (limited)
      'reports:daily',
      'reports:weekly',
    ],

    admin: [
      // Full system access
      'system:manage',
      'system:settings',
      'system:backup',
      'system:logs',

      // User management
      'users:read_all',
      'users:create',
      'users:update_all',
      'users:delete',
      'users:activate',
      'users:deactivate',
      'users:change_role',

      // Staff management
      'staff:manage',
      'staff:assign_roles',

      // Full customer access
      'customers:read_all',
      'customers:create',
      'customers:update',
      'customers:delete',
      'customers:search',
      'customers:export',

      // Full appointments access
      'appointments:read_all',
      'appointments:create',
      'appointments:update_all',
      'appointments:delete',
      'appointments:assign',
      'appointments:bulk_operations',

      // Full services management
      'services:read_all',
      'services:create',
      'services:update',
      'services:delete',
      'services:bulk_operations',
      'service_categories:manage',

      // Full parts management
      'parts:read_all',
      'parts:create',
      'parts:update',
      'parts:delete',
      'parts:stock_update',
      'parts:bulk_operations',
      'parts:import_export',

      // Full repairs management
      'repairs:read_all',
      'repairs:create',
      'repairs:update_all',
      'repairs:delete',
      'repairs:assign',
      'repairs:complete',

      // Full invoice management
      'invoices:read_all',
      'invoices:create',
      'invoices:update',
      'invoices:delete',
      'invoices:export',
      'invoices:reports',

      // Reviews management
      'reviews:read_all',
      'reviews:update_all',
      'reviews:delete',
      'reviews:moderate',
      'reviews:respond',
      'reviews:feature',

      // Promotions & loyalty
      'promotions:read_all',
      'promotions:create',
      'promotions:update',
      'promotions:delete',
      'loyalty:manage',

      // Full reporting
      'reports:all',
      'reports:export',
      'reports:advanced',
      'analytics:view',

      // Financial
      'financial:view_all',
      'financial:reports',
      'financial:export',
    ],
  } as const;

  /**
   * Check if user has specific permission
   */
  static hasPermission(user: User, permission: string): boolean {
    const userRole = user.role as keyof typeof RoleService.ROLE_PERMISSIONS;
    const permissions = this.ROLE_PERMISSIONS[userRole] || [];
    return permissions.includes(permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  static hasAnyPermission(user: User, permissions: string[]): boolean {
    return permissions.some(permission => this.hasPermission(user, permission));
  }

  /**
   * Check if user has all specified permissions
   */
  static hasAllPermissions(user: User, permissions: string[]): boolean {
    return permissions.every(permission => this.hasPermission(user, permission));
  }

  /**
   * Get all permissions for a user's role
   */
  static getUserPermissions(user: User): string[] {
    const userRole = user.role as keyof typeof RoleService.ROLE_PERMISSIONS;
    return this.ROLE_PERMISSIONS[userRole] || [];
  }

  /**
   * Check if user role has sufficient level for minimum required role
   */
  static hasRoleLevel(userRole: string, minimumRole: string): boolean {
    const userLevel = this.ROLE_LEVELS[userRole as keyof typeof this.ROLE_LEVELS] || 0;
    const requiredLevel = this.ROLE_LEVELS[minimumRole as keyof typeof this.ROLE_LEVELS] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Check if user can access resource owned by another user
   */
  static canAccessResource(
    currentUser: User,
    resourceOwnerId: number,
    requiredPermissions: string[]
  ): boolean {
    // Owner can always access their own resources
    if (currentUser.id === resourceOwnerId) {
      return true;
    }

    // Check if user has any of the required global permissions
    return this.hasAnyPermission(currentUser, requiredPermissions);
  }

  /**
   * Check if user can modify resource
   */
  static canModifyResource(
    currentUser: User,
    resourceOwnerId: number,
    ownPermissions: string[],
    globalPermissions: string[]
  ): boolean {
    // Check if user owns the resource and has own permissions
    if (currentUser.id === resourceOwnerId) {
      return this.hasAnyPermission(currentUser, ownPermissions);
    }

    // Check if user has global permissions
    return this.hasAnyPermission(currentUser, globalPermissions);
  }

  /**
   * Get available roles
   */
  static getAvailableRoles(): string[] {
    return Object.keys(this.ROLE_LEVELS);
  }

  /**
   * Get role hierarchy
   */
  static getRoleHierarchy(): typeof RoleService.ROLE_LEVELS {
    return this.ROLE_LEVELS;
  }

  /**
   * Check if user can assign specific role to another user
   */
  static canAssignRole(adminUser: User, targetRole: string): boolean {
    // Only admins can assign roles
    if (adminUser.role !== 'admin') {
      return false;
    }

    // Admin can assign any role except admin (for security)
    if (targetRole === 'admin') {
      return false;
    }

    return this.getAvailableRoles().includes(targetRole);
  }

  /**
   * Get permissions by category for a role
   */
  static getPermissionsByCategory(role: string): Record<string, string[]> {
    const permissions = this.ROLE_PERMISSIONS[role as keyof typeof this.ROLE_PERMISSIONS] || [];
    const categories: Record<string, string[]> = {};

    permissions.forEach(permission => {
      const [category] = permission.split(':');
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(permission);
    });

    return categories;
  }

  /**
   * Resource access control helper
   */
  static createResourceAccessChecker(resourceType: string) {
    return {
      canRead: (user: User, ownerId?: number) => {
        const readOwnPermission = `${resourceType}:read_own`;
        const readAllPermission = `${resourceType}:read_all`;

        if (ownerId && user.id === ownerId) {
          return this.hasPermission(user, readOwnPermission);
        }

        return this.hasPermission(user, readAllPermission);
      },

      canWrite: (user: User, ownerId?: number) => {
        const updateOwnPermission = `${resourceType}:update_own`;
        const updateAllPermission = `${resourceType}:update_all`;
        const createPermission = `${resourceType}:create`;

        if (ownerId && user.id === ownerId) {
          return this.hasAnyPermission(user, [updateOwnPermission, createPermission]);
        }

        return this.hasAnyPermission(user, [updateAllPermission, createPermission]);
      },

      canDelete: (user: User, ownerId?: number) => {
        const deleteOwnPermission = `${resourceType}:delete_own`;
        const deleteAllPermission = `${resourceType}:delete_all`;
        const deletePermission = `${resourceType}:delete`;

        if (ownerId && user.id === ownerId) {
          return this.hasPermission(user, deleteOwnPermission);
        }

        return this.hasAnyPermission(user, [deleteAllPermission, deletePermission]);
      },
    };
  }

  /**
   * Common resource access controllers
   */
  static readonly Appointments = this.createResourceAccessChecker('appointments');
  static readonly Customers = this.createResourceAccessChecker('customers');
  static readonly Services = this.createResourceAccessChecker('services');
  static readonly Parts = this.createResourceAccessChecker('parts');
  static readonly Repairs = this.createResourceAccessChecker('repairs');
  static readonly Invoices = this.createResourceAccessChecker('invoices');
  static readonly Reviews = this.createResourceAccessChecker('reviews');
  static readonly Vehicles = this.createResourceAccessChecker('vehicles');
}