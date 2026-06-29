import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { getNextIGP, getNextOGP, peekNextIGP, peekNextOGP } from '../../utils/docCounter';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';
import {
  GatePassVoidError,
  getDocStatus,
  voidIGP,
  voidOGP,
  restoreIGP,
  restoreOGP,
} from './gatePassVoid.service';

const router = Router();
router.use(authenticate);

// ── Schemas ────────────────────────────────────────────────────────────────

const stockInItemSchema = z.object({
  productId:       z.string().uuid(),
  cartons:         z.number().int().positive(),
  weightPerCarton: z.number().positive(),
  packingType:     z.string().optional(),
  mfgDate:         z.string().optional(),
  expiryDate:      z.string(),
  batchNo:         z.string().optional(),
  lotNo:           z.string().optional(),
  room:            z.string().min(1),
  side:            z.enum(['L', 'R']).optional().default('L'),
  row:             z.string().default(''),
  slot:            z.string().default(''),
  position:        z.number().int().optional(),
});

const stockInSchema = z.object({
  header: z.object({
    vehicleNo:            z.string().min(1),
    driverId:             z.string().optional(),
    driverName:           z.string().min(1),
    sealNumber:           z.string().optional(),
    temperatureAtReceipt: z.number(),
    condition:            z.enum(['Good', 'Damaged', 'Partial']).default('Good'),
    notes:                z.string().optional(),
    orderRef:             z.string().optional(),
    departureTime:        z.string().optional(),
    timeIn:               z.string().optional(),
    operatorName:         z.string().optional(),
  }),
  items: z.array(stockInItemSchema).min(1, 'At least one item required'),
});

const stockOutItemSchema = z.object({
  palletId:   z.string().min(1),
  cartonsOut: z.number().int().positive(),
});

const stockOutSchema = z.object({
  header: z.object({
    vehicleNo:    z.string().optional(),
    driverId:     z.string().optional(),
    driverName:   z.string().optional(),
    destination:  z.string().optional(),
    reason:       z.string().optional(),
    notes:        z.string().optional(),
    orderRef:     z.string().optional(),
    tempCheck:    z.string().optional(),
    condition:    z.string().optional(),
    operatorName: z.string().optional(),
  }),
  items: z.array(stockOutItemSchema).min(1),
});

const movePalletSchema = z.object({
  palletId:    z.string().min(1),
  newRoom:     z.string().min(1),
  newSide:     z.enum(['L', 'R']).optional().default('L'),
  newRow:      z.string().default(''),
  newSlot:     z.string().default(''),
  newPosition: z.number().int().optional(),
  movedBy:     z.string().optional(),
});

const editIGPSchema = z.object({
  header: z.object({
    vehicleNo:            z.string().optional(),
    driverId:             z.string().optional(),
    driverName:           z.string().optional(),
    sealNumber:           z.string().optional(),
    temperatureAtReceipt: z.number().optional(),
    productTemperature:   z.string().optional(),
    condition:            z.enum(['Good', 'Damaged', 'Partial']).optional(),
    notes:                z.string().optional(),
    orderRef:             z.string().optional(),
    departureTime:        z.string().optional(),
    timeIn:               z.string().optional(),
  }),
  items: z.array(z.object({
    palletId:        z.string(),
    cartons:         z.number().int().positive().optional(),
    weightPerCarton: z.number().positive().optional(),
    packingType:     z.string().optional(),
    mfgDate:         z.string().optional(),
    expiryDate:      z.string().optional(),
    batchNo:         z.string().optional(),
    lotNo:           z.string().optional(),
    productId:       z.string().optional(),
    productName:     z.string().optional(),
    productCode:     z.string().optional(),
  })),
});

const editOGPSchema = z.object({
  header: z.object({
    vehicleNo:   z.string().optional(),
    driverId:    z.string().optional(),
    driverName:  z.string().optional(),
    destination: z.string().optional(),
    reason:      z.string().optional(),
    notes:       z.string().optional(),
    orderRef:    z.string().optional(),
    vehicleTemp: z.string().optional(),
    condition:   z.string().optional(),
  }),
  lines: z.array(z.object({
    movementId:      z.string(),
    palletId:        z.string(),
    newCartons:      z.number().int().min(0),
    productId:       z.string().optional(),
    productName:     z.string().optional(),
    productCode:     z.string().optional(),
    weightPerCarton: z.number().positive().optional(),
  })).optional(),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatLocation(room: string, side: string, row: string, slot: string, position?: number | null): string {
  if (room === 'Ante Room') return 'Ante Room (Floor)';
  return `${room} ${side}${row}-${slot}${position ? `-P${position}` : ''}`;
}

function getUsername(req: Request): string | null {
  return (req as any).user?.username ?? null;
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.get('/next-igp', async (_req, res) => {
  try { sendSuccess(res, { number: await peekNextIGP() }); }
  catch (err) { sendServerError(res); }
});

router.get('/next-ogp', async (_req, res) => {
  try { sendSuccess(res, { number: await peekNextOGP() }); }
  catch (err) { sendServerError(res); }
});

// ── COUNTERS ─────────────────────────────────────────────────────────────────
router.get('/counters', async (_req, res) => {
  try {
    const counter = await prisma.docCounter.findUnique({ where: { id: 'main' } });
    const year = new Date().getFullYear();
    sendSuccess(res, {
      igpYear: counter?.igpYear ?? year,
      igpSeq: counter?.igpSeq ?? 0,
      ogpYear: counter?.ogpYear ?? year,
      ogpSeq: counter?.ogpSeq ?? 0,
      igpInitialized: Boolean(counter),
      ogpInitialized: Boolean(counter),
      nextIGP: await peekNextIGP(),
      nextOGP: await peekNextOGP(),
    });
  } catch (err) { sendServerError(res); }
});

router.put('/counters', requireMinRole('admin'), async (req: Request, res: Response) => {
  try {
    const { igpSeq, ogpSeq } = req.body;
    const year = new Date().getFullYear();
    const counter = await prisma.docCounter.upsert({
      where:  { id: 'main' },
      create: { id: 'main', igpSeq: igpSeq ?? 1, ogpSeq: ogpSeq ?? 1, igpYear: year, ogpYear: year },
      update: {
        ...(igpSeq !== undefined && { igpSeq }),
        ...(ogpSeq !== undefined && { ogpSeq }),
      },
    });
    sendSuccess(res, {
      ...counter,
      igpInitialized: true,
      ogpInitialized: true,
      nextIGP: await peekNextIGP(),
      nextOGP: await peekNextOGP(),
    }, 'Counters updated');
  } catch (err) { sendServerError(res); }
});

// ── STOCK IN (IGP) ──────────────────────────────────────────────────────────
router.post('/in', requireMinRole('operator'), validate(stockInSchema), async (req: Request, res: Response) => {
  try {
    const { header, items } = req.body;
    const now = new Date();

    const uniqueProductIds: string[] = [...new Set<string>(items.map((i: any) => i.productId as string))];
    const products = await prisma.product.findMany({
      where:   { id: { in: uniqueProductIds } },
      include: { customer: true },
    });
    const productMap = new Map<string, any>((products as any[]).map((p: any) => [p.id, p]));

    for (const item of items) {
      if (!productMap.has(item.productId)) {
        return sendError(res, `Product not found: ${item.productId}`, 404);
      }
    }

    const igpNumber = await getNextIGP();

    const palletRows:   object[] = [];
    const movementRows: object[] = [];

    for (let idx = 0; idx < items.length; idx++) {
      const item    = items[idx];
      const product = productMap.get(item.productId)!;
      const palletId    = `P-${igpNumber}-${String(idx + 1).padStart(3, '0')}`;
      const totalWeight = item.cartons * item.weightPerCarton;
      const location    = formatLocation(item.room, item.side ?? 'L', item.row ?? '', item.slot ?? '', item.position);

      // Check location conflict (skip Ante Room)
      if (item.room !== 'Ante Room') {
        const conflict = await prisma.pallet.findFirst({
          where: {
            status: 'active',
            room: item.room,
            side: item.side ?? 'L',
            row: item.row ?? '',
            slot: item.slot ?? '',
            position: item.position ?? null,
          },
        });
        if (conflict) {
          return sendError(res, `Location ${location} is already occupied by pallet ${conflict.id}`, 409);
        }
      }

      palletRows.push({
        id:                   palletId,
        igpNumber,
        vehicleNo:            header.vehicleNo,
        driverName:           header.driverName,
        driverId:             header.driverId             ?? null,
        sealNumber:           header.sealNumber           ?? null,
        productId:            product.id,
        customerId:           product.customer.id,
        productName:          product.name,
        productCode:          product.code,
        customerName:         product.customer.name,
        cartons:              item.cartons,
        weightPerCarton:      item.weightPerCarton,
        totalWeight,
        packingType:          item.packingType            ?? null,
        mfgDate:              item.mfgDate ? new Date(item.mfgDate) : null,
        expiryDate:           new Date(item.expiryDate),
        batchNo:              item.batchNo                ?? null,
        lotNo:                item.lotNo                  ?? null,
        orderRef:             header.orderRef             ?? null,
        dateIn:               now,
        timeIn:               header.timeIn               ?? null,
        departureTime:        header.departureTime        ?? null,
        room:                 item.room,
        side:                 item.side                   ?? 'L',
        row:                  item.row                    ?? '',
        slot:                 item.slot                   ?? '',
        position:             item.position               ?? null,
        status:               'active',
        condition:            header.condition             ?? 'Good',
        temperatureAtReceipt: header.temperatureAtReceipt,
        notes:                header.notes               ?? null,
      });

      movementRows.push({
        docNumber:    igpNumber,
        type:         'IN',
        palletId,
        customerId:   product.customer.id,
        customerName: product.customer.name,
        productName:  product.name,
        productCode:  product.code,
        cartons:      item.cartons,
        totalWeight,
        location,
        vehicleNo:    header.vehicleNo,
        driverName:   header.driverName,
        driverId:     header.driverId    ?? null,
        reason:       'Receiving',
        operatorName: header.operatorName ?? getUsername(req),
        orderRef:     header.orderRef    ?? null,
      });
    }

    await prisma.$transaction([
      prisma.pallet.createMany({ data: palletRows as any }),
      prisma.stockMovement.createMany({ data: movementRows as any }),
    ]);

    logger.info(`IGP created: ${igpNumber} — ${items.length} pallets`);
    sendCreated(
      res,
      { igpNumber, palletIds: (palletRows as any[]).map((p) => (p as any).id), count: items.length },
      `IGP ${igpNumber} created with ${items.length} pallets`
    );
  } catch (err: any) {
    logger.error('stock.in', err);
    if (err.message?.startsWith('Product not found')) return sendError(res, err.message, 404);
    sendServerError(res);
  }
});

// ── STOCK OUT (OGP) ─────────────────────────────────────────────────────────
router.post('/out', requireMinRole('operator'), validate(stockOutSchema), async (req: Request, res: Response) => {
  try {
    const { header, items } = req.body;
    const now = new Date();

    // Validate: no duplicate palletId in items
    const uniquePalletIds = new Set(items.map((i: any) => i.palletId as string));
    if (uniquePalletIds.size !== items.length) {
      return sendError(res, 'Duplicate palletId in items — each pallet can only be dispatched once per OGP', 400);
    }

    const palletIds: string[] = items.map((i: any) => i.palletId as string);
    const pallets = await prisma.pallet.findMany({ where: { id: { in: palletIds } } }) as any[];
    const palletMap = new Map<string, any>(pallets.map((p: any) => [p.id, p]));

    for (const item of items) {
      const pallet = palletMap.get(item.palletId);
      if (!pallet)                                  return sendError(res, `Pallet not found: ${item.palletId}`, 404);
      if (pallet.status !== 'active')               return sendError(res, `Pallet ${item.palletId} is not active`, 400);
      if (item.cartonsOut > Number(pallet.cartons)) return sendError(res, `Cannot dispatch ${item.cartonsOut} cartons — only ${pallet.cartons} available in pallet ${item.palletId}`, 400);
    }

    const ogpNumber = await getNextOGP();

    const palletUpdates: any[]  = [];
    const movementRows:  object[] = [];

    for (const item of items) {
      const pallet      = palletMap.get(item.palletId)!;
      const remaining   = Number(pallet.cartons) - item.cartonsOut;
      const totalWeight = item.cartonsOut * Number(pallet.weightPerCarton);
      const location    = formatLocation(pallet.room, pallet.side ?? 'L', pallet.row ?? '', pallet.slot ?? '');

      palletUpdates.push(prisma.pallet.update({
        where: { id: item.palletId },
        data: {
          cartons:     remaining,
          totalWeight: remaining * Number(pallet.weightPerCarton),
          status:      remaining <= 0 ? 'dispatched' : 'active',
        },
      }));

      movementRows.push({
        docNumber:    ogpNumber,
        type:         'OUT',
        palletId:     pallet.id,
        customerId:   pallet.customerId,
        customerName: pallet.customerName,
        productName:  pallet.productName,
        productCode:  pallet.productCode,
        cartons:      item.cartonsOut,
        totalWeight,
        location,
        vehicleNo:    header.vehicleNo   ?? null,
        driverName:   header.driverName  ?? null,
        driverId:     header.driverId    ?? null,
        destination:  header.destination ?? null,
        reason:       header.reason      ?? 'Dispatch',
        notes:        header.notes       ?? null,
        vehicleTemp:  header.tempCheck   ?? null,
        condition:    header.condition   ?? 'Good',
        operatorName: header.operatorName ?? getUsername(req),
        orderRef:     header.orderRef    ?? null,
      });
    }

    await prisma.$transaction(
      [...palletUpdates, prisma.stockMovement.createMany({ data: movementRows as any })]
    );

    logger.info(`OGP created: ${ogpNumber} — ${items.length} items dispatched`);
    sendCreated(res, { ogpNumber, count: items.length }, `OGP ${ogpNumber} created`);
  } catch (err: any) {
    logger.error('stock.out', err);
    if (err.message?.startsWith('Pallet') || err.message?.startsWith('Cannot dispatch')) {
      return sendError(res, err.message, 400);
    }
    sendServerError(res);
  }
});

// ── MOVE PALLET ─────────────────────────────────────────────────────────────
router.post('/move', requireMinRole('operator'), validate(movePalletSchema), async (req: Request, res: Response) => {
  try {
    const { palletId, newRoom, newSide, newRow, newSlot, newPosition, movedBy } = req.body;

    const pallet = await prisma.pallet.findUnique({ where: { id: palletId } });
    if (!pallet)                    return sendNotFound(res, 'Pallet not found');
    if (pallet.status !== 'active') return sendError(res, 'Pallet is not active', 400);

    const isAnteRoom = newRoom === 'Ante Room';

    // Ante Room is floor storage — no racks/slots/positions, so multiple pallets
    // can coexist there freely. Skip the slot-conflict check entirely for it.
    if (!isAnteRoom) {
      const conflict = await prisma.pallet.findFirst({
        where: { id: { not: palletId }, status: 'active', room: newRoom, side: newSide, row: newRow, slot: newSlot, position: newPosition },
      });
      if (conflict) return sendError(res, `Position P-${newPosition} in ${newRoom} ${newSide}${newRow}-${newSlot} is already occupied by pallet ${conflict.id}`, 409);
    }

    const finalPosition = isAnteRoom ? 0 : newPosition;
    const location = formatLocation(newRoom, newSide ?? 'L', newRow ?? '', newSlot ?? '', finalPosition);
    const operator = movedBy ?? getUsername(req);

    await prisma.$transaction([
      prisma.pallet.update({
        where: { id: palletId },
        data:  { room: newRoom, side: newSide ?? 'L', row: newRow ?? '', slot: newSlot ?? '', position: finalPosition },
      }),
      prisma.stockMovement.create({
        data: {
          docNumber:    '-',
          type:         'MOVE',
          palletId,
          customerId:   pallet.customerId,
          customerName: pallet.customerName,
          productName:  pallet.productName,
          productCode:  pallet.productCode,
          cartons:      pallet.cartons,
          totalWeight:  Number(pallet.totalWeight),
          location,
          reason:       `Moved by ${operator}`,
          operatorName: operator,
        },
      }),
    ]);

    logger.info(`Pallet moved: ${palletId} → ${location}`);
    sendSuccess(res, { palletId, newLocation: location }, 'Pallet moved successfully');
  } catch (err) { logger.error('stock.move', err); sendServerError(res); }
});

// ── EDIT IGP ────────────────────────────────────────────────────────────────
router.put('/igp/:number', requireMinRole('supervisor'), validate(editIGPSchema), async (req: Request, res: Response) => {
  try {
    const igpNumber = req.params.number;
    const { header, items } = req.body;
    const now = new Date();

    const pallets = await prisma.pallet.findMany({ where: { igpNumber } });
    if (pallets.length === 0) return sendNotFound(res, `IGP ${igpNumber} not found`);
    if (pallets.every(p => p.status === 'voided')) {
      return sendError(res, 'Cannot edit a voided IGP — use Redo (Restore) first', 400);
    }

    // Block: if any pallet has active OUT movements, editing is not allowed
    const palletIds = pallets.map(p => p.id);
    const activeOuts = palletIds.length
      ? await prisma.stockMovement.findMany({
          where: { palletId: { in: palletIds }, type: 'OUT', status: 'active' },
          select: { docNumber: true },
        })
      : [];
    if (activeOuts.length > 0) {
      const ogpNums = [...new Set(activeOuts.map(m => m.docNumber))];
      return sendError(res, `Cannot edit IGP — undo related OGP first: ${ogpNums.join(', ')}`, 409);
    }

    const palletUpdates = (pallets as any[]).map((pallet: any) => {
      const itemUpdate = items.find((i: any) => i.palletId === pallet.id);
      const newCartons = itemUpdate?.cartons ?? Number(pallet.cartons);
      const newWeightPerCarton = itemUpdate?.weightPerCarton ?? Number(pallet.weightPerCarton);
      const newTotalWeight = newCartons * newWeightPerCarton;
      return prisma.pallet.update({
        where: { id: pallet.id },
        data: {
          vehicleNo:            header.vehicleNo            ?? pallet.vehicleNo,
          driverName:           header.driverName           ?? pallet.driverName,
          driverId:             header.driverId             ?? pallet.driverId,
          sealNumber:           header.sealNumber           ?? pallet.sealNumber,
          temperatureAtReceipt: header.temperatureAtReceipt ?? pallet.temperatureAtReceipt,
          productTemperature:   header.productTemperature   ?? pallet.productTemperature,
          condition:            (header.condition           ?? pallet.condition) as any,
          notes:                header.notes               ?? pallet.notes,
          orderRef:             header.orderRef            ?? pallet.orderRef,
          departureTime:        header.departureTime       ?? pallet.departureTime,
          timeIn:               header.timeIn              ?? pallet.timeIn,
          revised:              true,
          revisedAt:            now,
          ...(itemUpdate && {
            cartons:         newCartons,
            weightPerCarton: newWeightPerCarton,
            totalWeight:     newTotalWeight,
            packingType:     itemUpdate.packingType ?? pallet.packingType,
            mfgDate:         itemUpdate.mfgDate    ? new Date(itemUpdate.mfgDate)    : pallet.mfgDate,
            expiryDate:      itemUpdate.expiryDate ? new Date(itemUpdate.expiryDate) : pallet.expiryDate,
            batchNo:         itemUpdate.batchNo    ?? pallet.batchNo,
            lotNo:           itemUpdate.lotNo      ?? pallet.lotNo,
            productId:       itemUpdate.productId  ?? pallet.productId,
            productName:     itemUpdate.productName ?? pallet.productName,
            productCode:     itemUpdate.productCode ?? pallet.productCode,
          }),
        },
      });
    });

    // Also update IN movements to match pallet changes
    const movements = await prisma.stockMovement.findMany({ where: { docNumber: igpNumber, type: 'IN' } });
    const movementUpdates = (movements as any[]).map((mov: any) => {
      const itemUpdate = items.find((i: any) => i.palletId === mov.palletId);
      return prisma.stockMovement.update({
        where: { id: mov.id },
        data: {
          vehicleNo:  header.vehicleNo  ?? mov.vehicleNo,
          driverName: header.driverName ?? mov.driverName,
          driverId:   header.driverId   ?? mov.driverId,
          revised:    true,
          revisedAt:  now,
          ...(itemUpdate && {
            cartons:     itemUpdate.cartons ?? mov.cartons,
            totalWeight: (itemUpdate.cartons ?? mov.cartons) * (itemUpdate.weightPerCarton ?? Number(mov.totalWeight) / (mov.cartons || 1)),
            productName: itemUpdate.productName ?? mov.productName,
            productCode: itemUpdate.productCode ?? mov.productCode,
          }),
        },
      });
    });

    await prisma.$transaction([...palletUpdates, ...movementUpdates]);

    sendSuccess(res, { igpNumber }, `IGP ${igpNumber} updated`);
  } catch (err) { logger.error('stock.editIGP', err); sendServerError(res); }
});

// ── EDIT OGP ────────────────────────────────────────────────────────────────
router.put('/ogp/:number', requireMinRole('supervisor'), validate(editOGPSchema), async (req: Request, res: Response) => {
  try {
    const ogpNumber = req.params.number;
    const { header, lines } = req.body;
    const now = new Date();

    const movements = await prisma.stockMovement.findMany({ where: { docNumber: ogpNumber, type: 'OUT' } });
    if (movements.length === 0) return sendNotFound(res, `OGP ${ogpNumber} not found`);
    if (movements.every(m => m.status === 'voided')) {
      return sendError(res, 'Cannot edit a voided OGP — use Redo (Restore) first', 400);
    }

    const palletIdsToFetch: string[] = (lines ?? []).map((l: any) => l.palletId as string).filter(Boolean);
    const fetchedPallets = palletIdsToFetch.length
      ? await prisma.pallet.findMany({ where: { id: { in: palletIdsToFetch } } })
      : [];
    const palletMap = new Map<string, any>((fetchedPallets as any[]).map((p: any) => [p.id, p]));

    const movementUpdates = (movements as any[]).map((mov: any) => {
      const lineUpdate = (lines ?? []).find((l: any) => l.movementId === mov.id);
      const newCartons = lineUpdate?.newCartons ?? mov.cartons;
      // Prevent division by zero
      const wt = lineUpdate?.weightPerCarton ?? (Number(mov.totalWeight) / (mov.cartons > 0 ? mov.cartons : 1));
      return prisma.stockMovement.update({
        where: { id: mov.id },
        data: {
          vehicleNo:   header.vehicleNo   ?? mov.vehicleNo,
          driverName:  header.driverName  ?? mov.driverName,
          driverId:    header.driverId    ?? mov.driverId,
          destination: header.destination ?? mov.destination,
          reason:      header.reason      ?? mov.reason,
          notes:       header.notes       ?? mov.notes,
          orderRef:    header.orderRef    ?? mov.orderRef,
          vehicleTemp: header.vehicleTemp ?? (mov as any).vehicleTemp,
          condition:   header.condition   ?? (mov as any).condition,
          cartons:     newCartons,
          totalWeight: newCartons * wt,
          ...(lineUpdate?.productName && { productName: lineUpdate.productName }),
          ...(lineUpdate?.productCode && { productCode: lineUpdate.productCode }),
          revised:   true,
          revisedAt: now,
        },
      });
    });

    const palletUpdates = (lines ?? [])
      .filter((l: any) => l.newCartons !== undefined)
      .map((l: any) => {
        const pallet = palletMap.get(l.palletId);
        if (!pallet) return null;
        const oldMov    = (movements as any[]).find((m: any) => m.palletId === l.palletId && m.type === 'OUT');
        const oldQty    = oldMov?.cartons ?? 0;
        // Validate: newCartons cannot exceed what pallet physically has + oldQty
        const available = Number(pallet.cartons) + oldQty;
        if (l.newCartons > available) {
          throw new GatePassVoidError(`Cannot dispatch ${l.newCartons} cartons — only ${available} available in pallet ${l.palletId}`);
        }
        const remaining = Math.max(0, available - l.newCartons);
        return prisma.pallet.update({
          where: { id: pallet.id },
          data: {
            cartons:     remaining,
            totalWeight: remaining * Number(pallet.weightPerCarton),
            status:      remaining <= 0 ? 'dispatched' : 'active',
            ...(l.productName && { productName: l.productName }),
            ...(l.productCode && { productCode: l.productCode }),
            ...(l.productId   && { productId:   l.productId }),
            revised:   true,
            revisedAt: now,
          },
        });
      })
      .filter((op: any) => op !== null);

    await prisma.$transaction([...movementUpdates, ...palletUpdates]);

    sendSuccess(res, { ogpNumber }, `OGP ${ogpNumber} updated`);
  } catch (err) { logger.error('stock.editOGP', err); sendServerError(res); }
});

const voidDocSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

// ── DOC STATUS (undo/redo eligibility) ───────────────────────────────────────
router.get('/doc-status/:docNumber', requireMinRole('operator'), async (req: Request, res: Response) => {
  try {
    const docNumber = req.params.docNumber;
    const docType = String(req.query.type || '').toUpperCase();
    if (docType !== 'IN' && docType !== 'OUT') {
      return sendError(res, 'Query param type must be IN or OUT', 400);
    }
    const status = await getDocStatus(docNumber, docType);
    if (status.status === 'not_found') return sendNotFound(res, status.blockReason ?? 'Not found');
    sendSuccess(res, status);
  } catch (err) { logger.error('stock.docStatus', err); sendServerError(res); }
});

// ── OGP UNDO (void) ─────────────────────────────────────────────────────────
router.post('/ogp/:number/void', requireMinRole('supervisor'), validate(voidDocSchema), async (req: Request, res: Response) => {
  try {
    const result = await voidOGP(req.params.number, getUsername(req) ?? 'unknown', req.body.reason);
    logger.info(`OGP voided: ${req.params.number} by ${getUsername(req)}`);
    sendSuccess(res, result, `OGP ${req.params.number} undone — dispatch reversed`);
  } catch (err: any) {
    if (err instanceof GatePassVoidError) return sendError(res, err.message, err.statusCode);
    logger.error('stock.voidOGP', err); sendServerError(res);
  }
});

// ── OGP REDO (restore) ──────────────────────────────────────────────────────
router.post('/ogp/:number/restore', requireMinRole('supervisor'), async (req: Request, res: Response) => {
  try {
    const result = await restoreOGP(req.params.number, getUsername(req) ?? 'unknown');
    logger.info(`OGP restored: ${req.params.number} by ${getUsername(req)}`);
    sendSuccess(res, result, `OGP ${req.params.number} restored — dispatch re-applied`);
  } catch (err: any) {
    if (err instanceof GatePassVoidError) return sendError(res, err.message, err.statusCode);
    logger.error('stock.restoreOGP', err); sendServerError(res);
  }
});

// ── IGP UNDO (void) ─────────────────────────────────────────────────────────
router.post('/igp/:number/void', requireMinRole('supervisor'), validate(voidDocSchema), async (req: Request, res: Response) => {
  try {
    const result = await voidIGP(req.params.number, getUsername(req) ?? 'unknown', req.body.reason);
    logger.info(`IGP voided: ${req.params.number} by ${getUsername(req)}`);
    sendSuccess(res, result, `IGP ${req.params.number} undone — stock removed from warehouse`);
  } catch (err: any) {
    if (err instanceof GatePassVoidError) return sendError(res, err.message, err.statusCode);
    logger.error('stock.voidIGP', err); sendServerError(res);
  }
});

// ── IGP REDO (restore) ──────────────────────────────────────────────────────
router.post('/igp/:number/restore', requireMinRole('supervisor'), async (req: Request, res: Response) => {
  try {
    const result = await restoreIGP(req.params.number, getUsername(req) ?? 'unknown');
    logger.info(`IGP restored: ${req.params.number} by ${getUsername(req)}`);
    sendSuccess(res, result, `IGP ${req.params.number} restored — stock back in warehouse`);
  } catch (err: any) {
    if (err instanceof GatePassVoidError) return sendError(res, err.message, err.statusCode);
    logger.error('stock.restoreIGP', err); sendServerError(res);
  }
});

export default router;
