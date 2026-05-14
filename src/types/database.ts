// Tipos compartidos — espejo de los modelos Prisma para uso en servicios

export type UserRole = 'superadmin' | 'admin' | 'gestor' | 'user';
export type UserPlan = 'free' | 'premium';

export interface DiagnosticResult {
  score:       number;
  maxScore:    number;
  breakdown:   { label: string; score: number; maxScore: number }[];
  completedAt: string;
}

export interface CourseEnrollment {
  id:          string;
  userId:      string;
  courseId:    string;
  progress:    number;
  completed:   boolean;
  enrolledAt:  Date;
  completedAt: Date | null;
}
