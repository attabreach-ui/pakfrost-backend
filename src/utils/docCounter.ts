import prisma from '../config/database';

// ── DocCounter utility ─────────────────────────────────────────────────────
// getNextIGP / getNextOGP are called OUTSIDE transactions now.
// Prisma sequential transactions (array form) do NOT support interactive tx client,
// so docCounter must be incremented before the transaction opens.
// This is safe: if the transaction fails after counter increment,
// the number is simply skipped (gap in sequence) — acceptable for WMS use.

export async function getNextIGP(): Promise<string> {
  const counter = await prisma.docCounter.upsert({
    where:  { id: 'main' },
    create: { id: 'main', igpSeq: 1 },
    update: { igpSeq: { increment: 1 } },
  });
  return `IGP-${String(counter.igpSeq).padStart(4, '0')}`;
}

export async function getNextOGP(): Promise<string> {
  const counter = await prisma.docCounter.upsert({
    where:  { id: 'main' },
    create: { id: 'main', ogpSeq: 1 },
    update: { ogpSeq: { increment: 1 } },
  });
  return `OGP-${String(counter.ogpSeq).padStart(4, '0')}`;
}

export async function peekNextIGP(): Promise<string> {
  const counter = await prisma.docCounter.findUnique({ where: { id: 'main' } });
  const next = (counter?.igpSeq ?? 0) + 1;
  return `IGP-${String(next).padStart(4, '0')}`;
}

export async function peekNextOGP(): Promise<string> {
  const counter = await prisma.docCounter.findUnique({ where: { id: 'main' } });
  const next = (counter?.ogpSeq ?? 0) + 1;
  return `OGP-${String(next).padStart(4, '0')}`;
}
