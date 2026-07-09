// Serializadores a snake_case — forma que consume el frontend.
// Prisma devuelve camelCase; aquí se normaliza el contrato de la API.

import type { Course, CourseEnrollment, CourseSection, SectionResource, Certificate } from '@prisma/client';

export function serializeCourse(c: Course) {
  return {
    id:             c.id,
    title:          c.title,
    description:    c.description,
    category:       c.category,
    level:          c.level,
    duration_hours: c.durationHours,
    image_url:      c.imageUrl,
    instructor:     c.instructor,
    lessons_count:  c.lessonsCount,
    is_published:   c.isPublished,
    pass_threshold: c.passThreshold,
    created_by:     c.createdBy,
    created_at:     c.createdAt.toISOString(),
    updated_at:     c.updatedAt.toISOString(),
  };
}

export function serializeEnrollment(e: CourseEnrollment) {
  return {
    id:           e.id,
    user_id:      e.userId,
    course_id:    e.courseId,
    progress:     e.progress,
    completed:    e.completed,
    enrolled_at:  e.enrolledAt.toISOString(),
    completed_at: e.completedAt?.toISOString() ?? null,
  };
}

export function serializeSection(
  s: CourseSection & { resources: SectionResource[] },
  completedIds: Set<string>,
) {
  return {
    id:          s.id,
    course_id:   s.courseId,
    sort_order:  s.sortOrder,
    title:       s.title,
    description: s.description,
    video_url:   s.videoUrl,
    completed:   completedIds.has(s.id),
    resources:   s.resources.map(r => ({
      id:    r.id,
      type:  r.type,
      title: r.title,
      url:   r.url,
    })),
  };
}

export function serializeCertificate(
  c: Certificate & { course?: { title: string; category?: string; level?: string; instructor?: string } | null },
) {
  return {
    id:           c.id,
    course_id:    c.courseId,
    code:         c.code,
    percentage:   c.percentage,
    issued_at:    c.issuedAt.toISOString(),
    course_title: c.course?.title ?? null,
    instructor:   c.course?.instructor ?? null,
  };
}
