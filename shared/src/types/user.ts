export enum UserRole {
  NURSE = 'NURSE',
  NURSE_SUPERVISOR = 'NURSE_SUPERVISOR',
  DOCTOR = 'DOCTOR',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum NurseAssignment {
  INSCRIPTION = 'INSCRIPTION',
  TRIAGE = 'TRIAGE',
  TREATMENT = 'TREATMENT',
  OFF = 'OFF',
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  profileCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  userId: string;
  cin: string | null;
  address: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
}

export interface UpdateProfileRequest {
  cin: string;
  address: string;
  firstName: string;
  lastName: string;
  birthDate: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  serverUrl?: string; // First time connection
}

export interface LoginResponse {
  token: string;
  user: User;
  todayAssignment?: NurseAssignment; // For nurses
}
