/**
 * Conflict Resolution Service
 *
 * Handles conflict detection and resolution using version vectors
 */

export interface ConflictResolution {
  strategy: 'server-wins' | 'client-wins' | 'merge' | 'manual';
  mergedData?: any;
  conflicts: ConflictField[];
  requiresUserInput: boolean;
}

export interface ConflictField {
  field: string;
  serverValue: any;
  clientValue: any;
  resolution?: 'server' | 'client' | 'merge';
}

export interface VersionVector {
  version: number;
  lastModified: string;
  modifiedBy: string;
}

/**
 * Detect conflicts between server and client data
 */
export function detectConflicts(
  entityType: string,
  serverData: any,
  clientData: any
): ConflictField[] {
  const conflicts: ConflictField[] = [];

  // Define fields to check for conflicts based on entity type
  const conflictFields = getConflictFields(entityType);

  for (const field of conflictFields) {
    const serverValue = getNestedValue(serverData, field);
    const clientValue = getNestedValue(clientData, field);

    // Check if values are different (with some tolerance for numbers)
    if (!areValuesEqual(serverValue, clientValue)) {
      conflicts.push({
        field,
        serverValue,
        clientValue,
      });
    }
  }

  return conflicts;
}

/**
 * Get fields to check for conflicts based on entity type
 */
function getConflictFields(entityType: string): string[] {
  switch (entityType) {
    case 'expense':
      return [
        'amount',
        'description',
        'category',
        'date',
        'notes',
        'participants',
      ];

    case 'settlement':
      return [
        'amount',
        'date',
        'notes',
      ];

    case 'group':
      return [
        'name',
        'description',
      ];

    default:
      return ['description', 'notes'];
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Check if two values are equal (with tolerance for numbers)
 */
function areValuesEqual(a: any, b: any): boolean {
  if (a === b) return true;

  // Handle null/undefined
  if (a == null || b == null) return a === b;

  // Handle numbers with small tolerance
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.01;
  }

  // Handle dates
  if (a instanceof Date && b instanceof Date) {
    return Math.abs(a.getTime() - b.getTime()) < 1000; // 1 second tolerance
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => areValuesEqual(item, b[index]));
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => areValuesEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Resolve conflicts automatically when possible
 */
export async function resolveConflicts(
  entityType: string,
  entityId: string,
  clientData: any,
  serverData: any
): Promise<ConflictResolution> {
  const conflicts = detectConflicts(entityType, serverData, clientData);

  if (conflicts.length === 0) {
    // No conflicts, use server version (most recent)
    return {
      strategy: 'server-wins',
      conflicts: [],
      requiresUserInput: false,
    };
  }

  // Try automatic resolution
  const resolution = tryAutomaticResolution(entityType, conflicts, clientData, serverData);

  if (resolution) {
    return resolution;
  }

  // Requires manual resolution
  return {
    strategy: 'manual',
    conflicts,
    requiresUserInput: true,
  };
}

/**
 * Try to resolve conflicts automatically
 */
function tryAutomaticResolution(
  entityType: string,
  conflicts: ConflictField[],
  clientData: any,
  serverData: any
): ConflictResolution | null {
  // For simple cases, prefer server version
  if (conflicts.length === 1) {
    const conflict = conflicts[0];

    // If it's just a timestamp or version field, server wins
    if (['updatedAt', 'lastModified', 'version'].includes(conflict.field)) {
      return {
        strategy: 'server-wins',
        conflicts,
        requiresUserInput: false,
      };
    }

    // If it's amount and difference is small, server wins
    if (conflict.field === 'amount' &&
        typeof conflict.serverValue === 'number' &&
        typeof conflict.clientValue === 'number') {
      const diff = Math.abs(conflict.serverValue - conflict.clientValue);
      if (diff < 1) { // Less than 1 unit difference
        return {
          strategy: 'server-wins',
          conflicts,
          requiresUserInput: false,
        };
      }
    }
  }

  // For expenses, try to merge non-conflicting changes
  if (entityType === 'expense' && conflicts.length <= 2) {
    const mergedData = { ...serverData };

    for (const conflict of conflicts) {
      // If conflict is in notes or description, merge them
      if (['notes', 'description'].includes(conflict.field)) {
        // Prefer server version for these fields
        continue;
      }

      // For other fields, can't auto-resolve
      return null;
    }

    return {
      strategy: 'merge',
      mergedData,
      conflicts,
      requiresUserInput: false,
    };
  }

  return null; // Requires manual resolution
}

/**
 * Apply conflict resolution
 */
export function applyResolution(
  originalData: any,
  conflicts: ConflictField[],
  strategy: 'server-wins' | 'client-wins' | 'merge'
): any {
  if (strategy === 'server-wins') {
    return originalData; // Keep server data
  }

  if (strategy === 'client-wins') {
    // Apply client changes to server data
    let result = { ...originalData };
    for (const conflict of conflicts) {
      setNestedValue(result, conflict.field, conflict.clientValue);
    }
    return result;
  }

  if (strategy === 'merge') {
    // Merge strategy - already handled in tryAutomaticResolution
    return originalData;
  }

  throw new Error(`Unknown resolution strategy: ${strategy}`);
}

/**
 * Set nested value in object using dot notation
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);

  target[lastKey] = value;
}

/**
 * Create a conflict record for manual resolution
 */
export function createConflictRecord(
  entityType: string,
  entityId: string,
  serverData: any,
  clientData: any,
  conflicts: ConflictField[]
) {
  return {
    id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    entityType,
    entityId,
    serverData,
    clientData,
    conflicts,
    createdAt: new Date().toISOString(),
    resolved: false,
  };
}

/**
 * Validate conflict resolution
 */
export function validateResolution(
  conflicts: ConflictField[],
  resolutions: Array<'server' | 'client' | 'merge'>
): boolean {
  if (conflicts.length !== resolutions.length) {
    return false;
  }

  // Check that all resolutions are valid
  return resolutions.every(resolution =>
    ['server', 'client', 'merge'].includes(resolution)
  );
}

/**
 * Apply manual resolutions
 */
export function applyManualResolutions(
  serverData: any,
  clientData: any,
  conflicts: ConflictField[],
  resolutions: Array<'server' | 'client' | 'merge'>
): any {
  if (!validateResolution(conflicts, resolutions)) {
    throw new Error('Invalid resolution configuration');
  }

  let result = { ...serverData };

  conflicts.forEach((conflict, index) => {
    const resolution = resolutions[index];

    switch (resolution) {
      case 'server':
        // Keep server value (already in result)
        break;
      case 'client':
        setNestedValue(result, conflict.field, conflict.clientValue);
        break;
      case 'merge':
        // For merge, try to combine values
        if (typeof conflict.serverValue === 'string' && typeof conflict.clientValue === 'string') {
          // Concatenate strings
          setNestedValue(result, conflict.field, `${conflict.serverValue} | ${conflict.clientValue}`);
        } else {
          // Default to server value
          setNestedValue(result, conflict.field, conflict.serverValue);
        }
        break;
    }
  });

  return result;
}

/**
 * Get all conflicts for a user (for UI display)
 */
export class ConflictResolver {
  private static conflicts: Map<string, any> = new Map();

  static async getUserConflicts(userId: string): Promise<any[]> {
    // In a real implementation, this would query a database
    // For now, return empty array as conflicts are handled in sync service
    return [];
  }

  static async resolveConflict(
    conflictId: string,
    resolution: 'server-wins' | 'client-wins' | 'merge',
    userId: string
  ): Promise<boolean> {
    try {
      // In a real implementation, this would:
      // 1. Find the conflict in database
      // 2. Apply the resolution
      // 3. Update the entity
      // 4. Mark conflict as resolved
      // 5. Trigger sync if needed

      // For now, just return success
      return true;
    } catch (error) {
      console.error('Error resolving conflict:', error);
      return false;
    }
  }
}