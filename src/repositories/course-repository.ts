import type { PrismaClient, CourseCategory, CourseLevel } from '@prisma/client';

type CreateCourseData = {
  title:        string;
  description:  string;
  category:     CourseCategory;
  level:        CourseLevel;
  durationHours: number;
  imageUrl?:    string | null;
  instructor:   string;
  lessonsCount: number;
  isPublished:  boolean;
  createdBy?:   string | null;
};

export class CourseRepository {
  constructor(private db: PrismaClient) {}

  async getPublished() {
    return this.db.course.findMany({
      where:   { isPublished: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAll() {
    return this.db.course.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserEnrollments(userId: string) {
    return this.db.courseEnrollment.findMany({
      where: { userId },
    });
  }

  async enroll(userId: string, courseId: string) {
    return this.db.courseEnrollment.create({
      data: { userId, courseId, progress: 0, completed: false },
    });
  }

  async updateProgress(enrollmentId: string, progress: number, completed: boolean) {
    await this.db.courseEnrollment.update({
      where: { id: enrollmentId },
      data: {
        progress:    Math.min(progress, 100),
        completed,
        completedAt: completed ? new Date() : null,
      },
    });
  }

  async create(data: CreateCourseData) {
    return this.db.course.create({ data });
  }
}
