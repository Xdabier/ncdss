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
  createdAt: string;
  updatedAt: string;
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
