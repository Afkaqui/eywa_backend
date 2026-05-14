import { CourseRepository } from '@/repositories/course-repository';
import type { CourseEnrollment } from '@/types/database';

export interface CourseStats {
  totalCourses: number;
  enrolled:     number;
  completed:    number;
  inProgress:   number;
  avgProgress:  number;
}

export class CourseService {
  constructor(private repository: CourseRepository) {}

  async getPublishedCourses() {
    return this.repository.getPublished();
  }

  async getUserEnrollments(userId: string) {
    return this.repository.getUserEnrollments(userId);
  }

  async enrollUser(userId: string, courseId: string) {
    return this.repository.enroll(userId, courseId);
  }

  async updateProgress(enrollmentId: string, newProgress: number): Promise<void> {
    const progress  = Math.min(newProgress, 100);
    const completed = progress >= 100;
    await this.repository.updateProgress(enrollmentId, progress, completed);
  }

  static calculateStats(
    totalCourses: number,
    enrollments: CourseEnrollment[]
  ): CourseStats {
    const completed  = enrollments.filter(e => e.completed).length;
    const inProgress = enrollments.filter(e => !e.completed).length;
    const avgProgress = enrollments.length > 0
      ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
      : 0;

    return { totalCourses, enrolled: enrollments.length, completed, inProgress, avgProgress };
  }
}
