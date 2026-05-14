import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Portfolio companies ──────────────────────────────────────────────────────
  const companiesCount = await prisma.portfolioCompany.count();
  if (companiesCount === 0) {
    await prisma.portfolioCompany.createMany({
      data: [
        { name: 'Amazonia Agrotech',     sector: 'Agricultura',   score: 85, status: 'Verificado',          carbon: '1,204t', trend: '+5%', lastAudit: 'Hace 2 dias',  risk: 'bajo'  },
        { name: 'Verde Innovations',     sector: 'Tecnologia',    score: 78, status: 'Auditoria Pendiente', carbon: '892t',   trend: '+2%', lastAudit: 'Hace 14 dias', risk: 'medio' },
        { name: 'EcoSolutions Corp',     sector: 'Energia',       score: 92, status: 'Verificado',          carbon: '2,156t', trend: '+8%', lastAudit: 'Hace 1 dia',   risk: 'bajo'  },
        { name: 'BioTech Dynamics',      sector: 'Biotecnologia', score: 71, status: 'En Revision',         carbon: '645t',   trend: '-1%', lastAudit: 'Hace 21 dias', risk: 'alto'  },
        { name: 'Sustainable Futures Inc', sector: 'Manufactura', score: 88, status: 'Verificado',          carbon: '1,567t', trend: '+6%', lastAudit: 'Hace 5 dias',  risk: 'bajo'  },
      ],
    });
    console.log('  ✅ Portfolio companies creadas');
  }

  // ── Diagnostic questions ─────────────────────────────────────────────────────
  const questionsCount = await prisma.diagnosticQuestion.count();
  if (questionsCount === 0) {
    const q1 = await prisma.diagnosticQuestion.create({
      data: {
        sortOrder: 1,
        title: 'Estado de Certificación Orgánica',
        description: 'Seleccione el estado actual de certificación orgánica de su empresa. Esta información es crítica para la evaluación de sostenibilidad.',
        contextTitle: 'Certificación Orgánica',
        contextDescription: 'La certificación orgánica valida prácticas agrícolas sostenibles y garantiza el cumplimiento de estándares ambientales.',
        contextImpact: '+15 puntos',
        contextImage: 'https://images.unsplash.com/photo-1763241841248-11aa17ab625a?w=1080',
        options: {
          createMany: {
            data: [
              { label: 'Certificación Orgánica',  value: 'yes',      score: 15, sortOrder: 1 },
              { label: 'Sin Certificación',        value: 'no',       score: 0,  sortOrder: 2 },
              { label: 'En Progreso',              value: 'progress', score: 10, sortOrder: 3 },
              { label: 'Aplicación Reciente',      value: 'applied',  score: 8,  sortOrder: 4 },
            ],
          },
        },
      },
    });

    const q2 = await prisma.diagnosticQuestion.create({
      data: {
        sortOrder: 2,
        title: 'Gestión de Emisiones de Carbono',
        description: 'Indique el nivel de implementación de sistemas de medición y reducción de emisiones de carbono.',
        contextTitle: 'Emisiones de Carbono',
        contextDescription: 'La medición precisa de emisiones es fundamental para la transición hacia operaciones carbono-neutral.',
        contextImpact: '+20 puntos',
        contextImage: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=1080',
        options: {
          createMany: {
            data: [
              { label: 'Sistema Completo Implementado', value: 'complete', score: 20, sortOrder: 1 },
              { label: 'Sistema Parcial',               value: 'partial',  score: 12, sortOrder: 2 },
              { label: 'En Fase de Planificación',      value: 'planning', score: 6,  sortOrder: 3 },
              { label: 'Sin Sistema Actual',            value: 'none',     score: 0,  sortOrder: 4 },
            ],
          },
        },
      },
    });

    await prisma.diagnosticQuestion.create({
      data: {
        sortOrder: 3,
        title: 'Prácticas de Gobernanza Social',
        description: 'Evalúe las prácticas de gobernanza y responsabilidad social de su organización.',
        contextTitle: 'Gobernanza Social',
        contextDescription: 'Las prácticas de gobernanza social son indicadores clave de sostenibilidad corporativa.',
        contextImpact: '+15 puntos',
        options: {
          createMany: {
            data: [
              { label: 'Gobernanza Completa',         value: 'complete',   score: 15, sortOrder: 1 },
              { label: 'Parcialmente Implementada',   value: 'partial',    score: 10, sortOrder: 2 },
              { label: 'En Desarrollo',               value: 'developing', score: 5,  sortOrder: 3 },
              { label: 'Sin Prácticas Formales',      value: 'none',       score: 0,  sortOrder: 4 },
            ],
          },
        },
      },
    });

    console.log('  ✅ Diagnostic questions creadas');
  }

  // ── Courses ──────────────────────────────────────────────────────────────────
  const coursesCount = await prisma.course.count();
  if (coursesCount === 0) {
    await prisma.course.createMany({
      data: [
        {
          title: 'Introduccion a la Sostenibilidad ESG',
          description: 'Aprende los fundamentos de los criterios Ambientales, Sociales y de Gobernanza para evaluar el impacto de tu organizacion.',
          category: 'esg', level: 'basico', durationHours: 4, instructor: 'EYWA Academy', lessonsCount: 8, isPublished: true,
          imageUrl: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=800&q=80',
        },
        {
          title: 'Certificacion Organica para Agronegocios',
          description: 'Guia completa para obtener la certificacion organica: requisitos, procesos y beneficios para productores agricolas.',
          category: 'agrotech', level: 'intermedio', durationHours: 6, instructor: 'Ing. Eduardo Noriega', lessonsCount: 12, isPublished: true,
          imageUrl: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&q=80',
        },
        {
          title: 'Medicion de Huella de Carbono',
          description: 'Metodologias y herramientas para medir, reportar y reducir las emisiones de carbono en tu empresa.',
          category: 'esg', level: 'intermedio', durationHours: 5, instructor: 'EYWA Academy', lessonsCount: 10, isPublished: true,
          imageUrl: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=800&q=80',
        },
        {
          title: 'Finanzas Sostenibles y Bonos Verdes',
          description: 'Comprende los instrumentos financieros sostenibles y como acceder a fondos de inversion de impacto.',
          category: 'banca_sostenible', level: 'avanzado', durationHours: 8, instructor: 'Esp. Maria Torres', lessonsCount: 15, isPublished: true,
          imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80',
        },
        {
          title: 'Buenas Practicas Agricolas (BPA)',
          description: 'Implementacion de practicas agricolas sostenibles para mejorar la productividad y reducir el impacto ambiental.',
          category: 'agrotech', level: 'basico', durationHours: 3, instructor: 'Ing. Carlos Mendoza', lessonsCount: 6, isPublished: true,
          imageUrl: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=800&q=80',
        },
        {
          title: 'Emprendimiento Digital Sostenible',
          description: 'Herramientas digitales y estrategias para escalar tu emprendimiento con enfoque en sostenibilidad.',
          category: 'edutech', level: 'basico', durationHours: 4, instructor: 'EYWA Academy', lessonsCount: 8, isPublished: true,
          imageUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&q=80',
        },
      ],
    });
    console.log('  ✅ Courses creados');
  }

  console.log('🎉 Seed completado');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
