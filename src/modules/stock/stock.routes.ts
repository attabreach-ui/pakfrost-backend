import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { getNextIGP, getNextOGP, peekNextIGP, peekNextOGP } from '../../utils/docCounter';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

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
  side:            z.enum(['L', 'R']),
  row:             z.string().min(1),
  slot:            z.string().min(1),
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
    vehicleNo:   z.string().optional(),
    driverId:    z.string().optional(),
    driverName:  z.string().optional(),
    destination: z.string().optional(),
    reason:      z.string().optional(),
    notes:       z.string().optional(),
    orderRef:    z.string().optional(),
    tempCheck:   z.string().optional(),
    condition:   z.string().optional(),
    operatorName: z.string().optional(),
  }),
  items: z.array(stockOutItemSchema).min(1),
});

const movePalletSchema = z.object({
  palletId:  z.string().min(1),
  newRoom:   z.string().min(1),
  newSide:   z.enum(['L', 'R']),
  newRow:    z.string().min(1),
  newSlot:   z.string().min(1),
  newPosition: z.number().int().optional(),
  movedBy:   z.string().optional(),
});

const editIGPSchema = z.object({
  header: z.object({
    vehicleNo:            z.string().optional(),
    driverId:             z.string().optional(),
    driverName:           z.string().optional(),
    sealNumber:           z.string().optional(),
    temperatureAtReceipt: z.number().optional(),
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

// ── Helper: format location string ────────────────────────────────────────

function formatLocation(room: string, side: string, row: string, slot: string, position?: number | null) {
  if (room === 'Ante Room') return 'Ante Room (Floor)';
  return `${room} ${side}${row}-${slot}${position ? `-P${position}` : ''}`;
}

// ── Routes ─────────────────────────────────────────────────────────────────

// Preview next IGP/OGP numbers
router.get('/next-igp', async (_req, res) => {
  try { sendSuccess(res, { number: await peekNextIGP() }); }
  catch (err) { sendServerError(res); }
});

router.get('/next-ogp', async (_req, res) => {
  try { sendSuccess(res, { number: await peekNextOGP() }); }
  catch (err) { sendServerError(res); }
});

// ── STOCK IN (IGP) ──────────────────────────────────────────────────────────
router.post('/in', requireMinRole('operator'), validate(stockInSchema), async (req: Request, res: Response) => {
  try {
    const { header, items } = req.body;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const igpNumber        = await getNextIGP(tx);
      const createdPallets   = [];
      const createdMovements = [];

      for (let idx = 0; idx < items.length; idx++) {
        const item    = items[idx];
        const product = await tx.product.findUnique({
          where:   { id: item.productId },
          include: { customer: true },
        });
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        const palletId    = `P-${igpNumber}-${String(idx + 1).padStart(3, '0')}`;
        const totalWeight = item.cartons * item.weightPerCarton;
        const location    = formatLocation(item.room, item.side, item.row, item.slot, item.position);

        const pallet = await tx.pallet.create({
          data: {
            id:                   palletId,
            igpNumber,
            vehicleNo:            header.vehicleNo,
            driverName:           header.driverName,
            driverId:             header.driverId,
            sealNumber:           header.sealNumber,
            productId:            product.id,
            customerId:           product.customer.id,
            productName:          product.name,
            productCode:          product.code,
            customerName:         product.customer.name,
            cartons:              item.cartons,
            weightPerCarton:      item.weightPerCarton,
            totalWeight,
            packingType:          item.packingType,
            mfgDate:              item.mfgDate   ? new Date(item.mfgDate)   : null,
            expiryDate:           new Date(item.expiryDate),
            batchNo:              item.batchNo,
            lotNo:                item.lotNo,
            orderRef:             header.orderRef,
            dateIn:               now,
            timeIn:               header.timeIn,
            departureTime:        header.departureTime,
            room:                 item.room,
            side:                 item.side,
            row:                  item.row,
            slot:                 item.slot,
            position:             item.position,
            status:               'active',
            condition:            header.condition || 'Good',
            temperatureAtReceipt: header.temperatureAtReceipt,
            notes:                header.notes,
          },
        });

        const movement = await tx.stockMovement.create({
          data: {
            docNumber:   igpNumber,
            type:        'IN',
            palletId:    pallet.id,
            customerId:  product.customer.id,
            customerName: product.customer.name,
            productName: product.name,
            productCode: product.code,
            cartons:     item.cartons,
            totalWeight,
            location,
            vehicleNo:   header.vehicleNo,
            driverName:  header.driverName,
            driverId:    header.driverId,
            reason:      'Receiving',
            operatorName: header.operatorName || req.user?.username,
            orderRef:    header.orderRef,
          },
        });

        createdPallets.push(pallet);
        createdMovements.push(movement);
      }

      return { igpNumber, pallets: createdPallets, movements: createdMovements };
    });

    logger.info(`IGP created: ${result.igpNumber} — ${items.length} pallets`);
    sendCreated(res, result, `IGP ${result.igpNumber} created with ${items.length} pallets`);
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

    const result = await prisma.$transaction(async (tx) => {
      const ogpNumber        = await getNextOGP(tx);
      const createdMovements = [];

      for (const item of items) {
        const pallet = await tx.pallet.findUnique({ where: { id: item.palletId } });
        if (!pallet) throw new Error(`Pallet not found: ${item.palletId}`);
        if (pallet.status !== 'active') throw new Error(`Pallet ${item.palletId} is not active`);
        if (item.cartonsOut > Number(pallet.cartons)) {
          throw new Error(`Cannot dispatch ${item.cartonsOut} cartons — only ${pallet.cartons} available in pallet ${item.palletId}`);
        }

        const remaining    = Number(pallet.cartons) - item.cartonsOut;
        const totalWeight  = item.cartonsOut * Number(pallet.weightPerCarton);
        const location     = formatLocation(pallet.room, pallet.side, pallet.row, pallet.slot);

        await tx.pallet.update({
          where: { id: item.palletId },
          data: {
            cartons:     remaining,
            totalWeight: remaining * Number(pallet.weightPerCarton),
            status:      remaining <= 0 ? 'dispatched' : 'active',
          },
        });

        const movement = await tx.stockMovement.create({
          data: {
            docNumber:   ogpNumber,
            type:        'OUT',
            palletId:    pallet.id,
            customerId:  pallet.customerId,
            customerName: pallet.customerName,
            productName: pallet.productName,
            productCode: pallet.productCode,
            cartons:     item.cartonsOut,
            totalWeight,
            location,
            vehicleNo:   header.vehicleNo,
            driverName:  header.driverName,
            driverId:    header.driverId,
            destination: header.destination,
            reason:      header.reason || 'Dispatch',
            notes:       header.notes,
            vehicleTemp: header.tempCheck || header.vehicleTemp,
            condition:   header.condition || 'Good',
            operatorName: header.operatorName || req.user?.username,
            orderRef:    header.orderRef,
          },
        });

        createdMovements.push(movement);
      }

      return { ogpNumber, movements: createdMovements };
    });

    logger.info(`OGP created: ${result.ogpNumber} — ${items.length} items dispatched`);
    sendCreated(res, result, `OGP ${result.ogpNumber} created`);
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
    if (!pallet) return sendNotFound(res, 'Pallet not found');
    if (pallet.status !== 'active') return sendError(res, 'Pallet is not active', 400);

    // Check slot conflict
    const conflict = await prisma.pallet.findFirst({
      where: {
        id: { not: palletId },
        status: 'active',
        room: newRoom, side: newSide, row: newRow, slot: newSlot,
      },
    });
    if (conflict) {
      return sendError(res, `Slot ${newRoom} ${newSide}${newRow}-${newSlot} is already occupied by pallet ${conflict.id}`, 409);
    }

    const location = formatLocation(newRoom, newSide, newRow, newSlot, newPosition);

    await prisma.$transaction([
      prisma.pallet.update({
        where: { id: palletId },
        data:  { room: newRoom, side: newSide, row: newRow, slot: newSlot, position: newPosition },
      }),
      prisma.stockMovement.create({
        data: {
          docNumber:   '-',
          type:        'MOVE',
          palletId,
          customerId:  pallet.customerId,
          customerName: pallet.customerName,
          productName: pallet.productName,
          productCode: pallet.productCode,
          cartons:     pallet.cartons,
          totalWeight: Number(pallet.totalWeight),
          location,
          reason:      `Moved by ${movedBy || req.user?.username}`,
          operatorName: movedBy || req.user?.username,
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

    await prisma.$transaction(async (tx) => {
      for (const pallet of pallets) {
        const itemUpdate = items.find((i: any) => i.palletId === pallet.id);
        await tx.pallet.update({
          where: { id: pallet.id },
          data: {
            vehicleNo:            header.vehicleNo            ?? pallet.vehicleNo,
            driverName:           header.driverName           ?? pallet.driverName,
            driverId:             header.driverId             ?? pallet.driverId,
            sealNumber:           header.sealNumber           ?? pallet.sealNumber,
            temperatureAtReceipt: header.temperatureAtReceipt ?? pallet.temperatureAtReceipt,
            condition:            header.condition            ?? pallet.condition,
            notes:                header.notes               ?? pallet.notes,
            orderRef:             header.orderRef            ?? pallet.orderRef,
            departureTime:        header.departureTime       ?? pallet.departureTime,
            timeIn:               header.timeIn              ?? pallet.timeIn,
            revised:              true,
            revisedAt:            now,
            ...(itemUpdate && {
              cartons:         itemUpdate.cartons         ?? pallet.cartons,
              weightPerCarton: itemUpdate.weightPerCarton ?? pallet.weightPerCarton,
              totalWeight:     (itemUpdate.cartons ?? Number(pallet.cartons)) * (itemUpdate.weightPerCarton ?? Number(pallet.weightPerCarton)),
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
      }

      // Update IN movements
      await tx.stockMovement.updateMany({
        where: { docNumber: igpNumber, type: 'IN' },
        data: {
          vehicleNo:  header.vehicleNo  ?? undefined,
          driverName: header.driverName ?? undefined,
          driverId:   header.driverId   ?? undefined,
          revised:    true,
          revisedAt:  now,
        },
      });
    });

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

    await prisma.$transaction(async (tx) => {
      // Update movements
      for (const mov of movements) {
        const lineUpdate = lines?.find((l: any) => l.movementId === mov.id);
        const newCartons = lineUpdate?.newCartons ?? mov.cartons;
        const wt         = lineUpdate?.weightPerCarton ?? (Number(mov.totalWeight) / (mov.cartons || 1));

        await tx.stockMovement.update({
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

        // Update pallet remaining cartons if qty changed
        if (lineUpdate && lineUpdate.newCartons !== mov.cartons) {
          const pallet = await tx.pallet.findUnique({ where: { id: mov.palletId } });
          if (pallet) {
            const oldQty  = mov.cartons;
            const newQty  = lineUpdate.newCartons;
            const remaining = Math.max(0, Number(pallet.cartons) + oldQty - newQty);
            await tx.pallet.update({
              where: { id: pallet.id },
              data: {
                cartons:     remaining,
                totalWeight: remaining * Number(pallet.weightPerCarton),
                status:      remaining <= 0 ? 'dispatched' : 'active',
                ...(lineUpdate.productName && { productName: lineUpdate.productName }),
                ...(lineUpdate.productCode && { productCode: lineUpdate.productCode }),
                ...(lineUpdate.productId   && { productId:   lineUpdate.productId }),
                revised:   true,
                revisedAt: now,
              },
            });
          }
        }
      }
    });

    sendSuccess(res, { ogpNumber }, `OGP ${ogpNumber} updated`);
  } catch (err) { logger.error('stock.editOGP', err); sendServerError(res); }
});

export default router;
