import prisma from '../../config/database';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.schema';

export const getAll = (activeOnly = false) =>
  prisma.customer.findMany({
    where:   activeOnly ? { isActive: true } : undefined,
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true, pallets: true } } },
  });

export const getById = (id: string) =>
  prisma.customer.findUnique({ where: { id }, include: { products: true } });

export const create = (data: CreateCustomerDto) =>
  prisma.customer.create({ data: {
    ...data,
    contractExpiry: data.contractExpiry ? new Date(data.contractExpiry) : undefined,
  }});

export const update = (id: string, data: UpdateCustomerDto) =>
  prisma.customer.update({ where: { id }, data: {
    ...data,
    contractExpiry: data.contractExpiry ? new Date(data.contractExpiry) : undefined,
  }});

export const remove = (id: string) => prisma.customer.delete({ where: { id } });
