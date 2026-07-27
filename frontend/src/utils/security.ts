export interface UserSecurityContext {
  id?: string;
  email?: string;
  role?: string;
  department_id?: string;
  faculty_profile?: {
    department_id?: string;
  };
}

/**
 * Enterprise Security Helper: Resolves the logged-in user's department ID.
 * Follows strict fallback rules: direct property -> nested profile -> email matching.
 */
export const getUserDeptId = (
  user: UserSecurityContext | null | undefined,
  departments: { id: string; code: string }[]
): string | undefined => {
  if (!user) return undefined;

  // 1. Direct property on user object
  if (user.department_id) return user.department_id;

  // 2. Nested faculty_profile property
  if (user.faculty_profile?.department_id) return user.faculty_profile.department_id;

  // 3. Fallback: Parse email for HOD accounts (e.g. hod_cse@anits.edu.in -> CSE, hod_it@anits.edu.in -> IT)
  if (user.email && user.email.includes('hod_')) {
    const code = user.email.split('hod_')[1]?.split('@')[0]?.toUpperCase();
    if (code) {
      const match = departments.find(d => d.code.toUpperCase() === code);
      if (match) return match.id;
    }
  }

  return undefined;
};

/**
 * Enterprise Security Helper: Checks if user has cross-department institution authority.
 */
export const isUserAdminOrDean = (user: UserSecurityContext | null | undefined): boolean => {
  if (!user) return false;
  const role = user.role?.toUpperCase();
  return role === 'ADMIN' || role === 'DEAN' || role === 'PRINCIPAL';
};
