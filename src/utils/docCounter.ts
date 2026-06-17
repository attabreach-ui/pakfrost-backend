import prisma from '../config/database';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function getNextIGP(tx?: Tx): Promise<string> {
  const client = tx ?? prisma;
  const counter = await client.docCounter.upsert({
    where:  { id: 'main' },
    create: { id: 'main', igpSeq: 1 },
    update: { igpSeq: { increment: 1 } },
  });
  return `IGP-${String(counter.igpSeq).padStart(4, '0')}`;
}

export async function getNextOGP(tx?: Tx): Promise<string> {
  const client = tx ?? prisma;
  const counter = await client.docCounter.upsert({
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
