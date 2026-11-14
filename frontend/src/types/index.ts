/**
 * Types partagés (noyau). Les clés sont en camelCase : le client HTTP convertit automatiquement
 * depuis/vers le snake_case de l'API Django (voir src/lib/api.ts).
 * Les types propres à un domaine vivent dans src/types/<domaine>.ts.
 * Tous les identifiants sont des UUID (string).
 */

export type Role = 'DIRECTEUR' | 'ASSISTANT' | 'MAITRE' | 'PARENT';

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  isActive: boolean;
  canViewFinance: boolean;
  mustChangePassword: boolean;
  assignedClassIds: string[];     // maître : ses classes
  associatedStudentIds: string[]; // parent : ses enfants
  lastLogin?: string | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isClosed: boolean;
}

export interface ClassRoom {
  id: string;
  name: string;
  level: string;
  academicYear: string;
  teacher: string | null;
  teacherName: string;
  roomNumber: string;
  capacity: number;
  enrolledCount: number;
}

export type StudentStatus = 'PAYANT' | 'SOCIAL';

export interface Student {
  id: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: 'M' | 'F';
  birthDate: string | null;
  birthPlace: string;
  nationality: string;
  address: string;
  photoUrl: string | null;      // URL signée à durée limitée
  fatherName: string;
  fatherPhone: string;
  motherName: string;
  motherPhone: string;
  guardianName: string;
  guardianPhone: string;
  emergencyContact: string;
  emergencyPhone: string;
  status: StudentStatus;
  enrollmentDate: string;
  notes?: string;               // absent pour maîtres et parents
  isArchived: boolean;
  createdAt: string;
  // dérivés (lecture seule)
  classId: string | null;
  className: string;
  teacherId: string | null;
  teacherName: string;
  academicYearId: string | null;
  isBoarding: boolean;
  roomId: string | null;
  roomName: string;
  bedNumber: string;
  currentSurahNumber: number | null;
  currentSurahName: string;
  currentAyah: number | null;
  currentJuz: number | null;
  currentHizb: number | null;
  lastProgressDate: string | null;
}

export interface Enrollment {
  id: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  academicYear: string;
  academicYearName: string;
  classroom: string | null;
  className: string;
  kind: 'INSCRIPTION' | 'REINSCRIPTION';
  status: 'ACTIVE' | 'RETIREE' | 'TERMINEE';
  studentStatus: StudentStatus;
  enrolledOn: string;
  assignments: { id: string; classroom: string; classroomName: string; startDate: string; endDate: string | null; reason: string; changedByName: string }[];
}

export type NotificationKind = 'CORAN' | 'EVALUATION' | 'PRESENCE' | 'VISITE' | 'FINANCE' | 'GENERAL';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  linkType: string;
  linkId: string;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  createdAt: string;
  userName: string;
  userRole: string;
  action: string;
  model: string;
  objectId: string;
  objectRepr: string;
  changes: Record<string, unknown>;
  ipAddress: string | null;
}
