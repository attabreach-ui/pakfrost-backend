import prisma from '../../config/database';

export class GatePassVoidError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'GatePassVoidError';
  }
}

function serializePallet(p: any) {
  return {
    id: p.id,
    igpNumber: p.igpNumber,
    vehicleNo: p.vehicleNo,
    driverName: p.driverName,
    driverId: p.driverId,
    sealNumber: p.sealNumber,
    productId: p.productId,
    customerId: p.customerId,
    productName: p.productName,
    productCode: p.productCode,
    customerName: p.customerName,
    cartons: Number(p.cartons),
    weightPerCarton: Number(p.weightPerCarton),
    totalWeight: Number(p.totalWeight),
    packingType: p.packingType,
    mfgDate: p.mfgDate?.toISOString?.() ?? p.mfgDate ?? null,
    expiryDate: p.expiryDate?.toISOString?.() ?? p.expiryDate,
    batchNo: p.batchNo,
    lotNo: p.lotNo,
    orderRef: p.orderRef,
    dateIn: p.dateIn?.toISOString?.() ?? p.dateIn,
    timeIn: p.timeIn,
    departureTime: p.departureTime,
    room: p.room,
    side: p.side,
    row: p.row,
    slot: p.slot,
    position: p.position,
    status: p.status,
    condition: p.condition,
    temperatureAtReceipt: Number(p.temperatureAtReceipt),
    productTemperature: p.productTemperature,
    notes: p.notes,
    revised: p.revised,
    revisedAt: p.revisedAt?.toISOString?.() ?? p.revisedAt ?? null,
  };
}

function serializeMovement(m: any) {
  return {
    id: m.id,
    docNumber: m.docNumber,
    type: m.type,
    status: m.status,
    palletId: m.palletId,
    customerId: m.customerId,
    customerName: m.customerName,
    productName: m.productName,
    productCode: m.productCode,
    cartons: Number(m.cartons),
    totalWeight: Number(m.totalWeight),
    location: m.location,
    vehicleNo: m.vehicleNo,
    driverName: m.driverName,
    driverId: m.driverId,
    destination: m.destination,
    reason: m.reason,
    notes: m.notes,
    vehicleTemp: m.vehicleTemp,
    condition: m.condition,
    operatorName: m.operatorName,
    orderRef: m.orderRef,
    createdAt: m.createdAt?.toISOString?.() ?? m.createdAt,
  };
}

export async function getDocStatus(docNumber: string, docType: 'IN' | 'OUT') {
  const movements = await prisma.stockMovement.findMany({
    where: { docNumber, type: docType },
  });
  if (movements.length === 0) {
    return { status: 'not_found' as const, canVoid: false, canRestore: false, blockReason: 'Document not found' };
  }

  const allVoided = movements.every(m => m.status === 'voided');
  const anyVoided = movements.some(m => m.status === 'voided');
  const snapshot = await prisma.gatePassSnapshot.findUnique({ where: { docNumber } });

  if (allVoided) {
    return {
      status: 'voided' as const,
      canVoid: false,
      canRestore: Boolean(snapshot),
      blockReason: snapshot ? null : 'No snapshot available for restore',
      voidedAt: movements[0].voidedAt,
      voidedBy: movements[0].voidedBy,
      voidReason: movements[0].voidReason,
    };
  }

  // If any movement is voided but not all, the document is in an inconsistent state
  if (anyVoided) {
    return {
      status: 'partial' as const,
      canVoid: false,
      canRestore: false,
      blockReason: 'Document is in an inconsistent state — contact admin',
    };
  }

  if (docType === 'IN') {
    const pallets = await prisma.pallet.findMany({ where: { igpNumber: docNumber } });
    if (pallets.length === 0) {
      return {
        status: 'active' as const,
        canVoid: false,
        canRestore: false,
        blockReason: 'IGP has no pallets — cannot undo',
      };
    }
    const palletIds = pallets.map(p => p.id);
    const activeOuts = await prisma.stockMovement.findMany({
      where: { palletId: { in: palletIds }, type: 'OUT', status: 'active' },
      select: { docNumber: true },
    });
    if (activeOuts.length > 0) {
      const ogpNums = [...new Set(activeOuts.map(m => m.docNumber))];
      return {
        status: 'active' as const,
        canVoid: false,
        canRestore: false,
        blockReason: `Undo related OGP first: ${ogpNums.join(', ')}`,
      };
    }
  }

  return { status: 'active' as const, canVoid: true, canRestore: false, blockReason: null };
}

export async function voidOGP(ogpNumber: string, voidedBy: string, reason: string) {
  if (!reason || reason.trim().length < 3) {
    throw new GatePassVoidError('Reason is required (min 3 characters)');
  }

  const movements = await prisma.stockMovement.findMany({
    where: { docNumber: ogpNumber, type: 'OUT' },
    orderBy: { createdAt: 'asc' },
  });
  if (movements.length === 0) throw new GatePassVoidError('OGP not found', 404);
  if (movements.some(m => m.status === 'voided')) {
    throw new GatePassVoidError('OGP is already voided');
  }

  const palletIds = movements.map(m => m.palletId);
  const pallets = await prisma.pallet.findMany({ where: { id: { in: palletIds } } });
  const palletMap = new Map(pallets.map(p => [p.id, p]));

  const lines = movements.map(m => {
    const pallet = palletMap.get(m.palletId);
    if (!pallet) throw new GatePassVoidError(`Pallet not found: ${m.palletId}`, 404);
    const cartonsOut = Number(m.cartons);
    const wtPer = Number(pallet.weightPerCarton);
    const restoredCartons = Number(pallet.cartons) + cartonsOut;
    return {
      movement: serializeMovement(m),
      palletId: m.palletId,
      cartonsOut,
      weightPerCarton: wtPer, // Store original weight for correct restore
      restoreState: {
        cartons: restoredCartons,
        totalWeight: restoredCartons * wtPer,
        status: 'active' as const,
      },
    };
  });

  const snapshot = {
    ogpNumber,
    docType: 'OUT',
    lines,
    voidedAt: new Date().toISOString(),
  };

  const now = new Date();

  await prisma.$transaction([
    ...lines.map(line =>
      prisma.pallet.update({
        where: { id: line.palletId },
        data: {
          cartons: line.restoreState.cartons,
          totalWeight: line.restoreState.totalWeight,
          status: line.restoreState.status,
        },
      })
    ),
    prisma.stockMovement.updateMany({
      where: { docNumber: ogpNumber, type: 'OUT' },
      data: { status: 'voided', voidedAt: now, voidedBy, voidReason: reason.trim() },
    }),
    prisma.gatePassSnapshot.upsert({
      where: { docNumber: ogpNumber },
      create: {
        docNumber: ogpNumber,
        docType: 'OUT',
        snapshot,
        voidedBy,
        voidReason: reason.trim(),
        voidedAt: now,
      },
      update: {
        snapshot,
        voidedBy,
        voidReason: reason.trim(),
        voidedAt: now,
      },
    }),
  ]);

  return { ogpNumber, status: 'voided', palletCount: lines.length };
}

export async function restoreOGP(ogpNumber: string, restoredBy: string) {
  const movements = await prisma.stockMovement.findMany({
    where: { docNumber: ogpNumber, type: 'OUT' },
  });
  if (movements.length === 0) throw new GatePassVoidError('OGP not found', 404);
  if (!movements.every(m => m.status === 'voided')) {
    throw new GatePassVoidError('OGP is not voided — nothing to restore');
  }

  const snapRecord = await prisma.gatePassSnapshot.findUnique({ where: { docNumber: ogpNumber } });
  if (!snapRecord) throw new GatePassVoidError('No snapshot found — cannot restore this OGP', 404);

  const snapshot = snapRecord.snapshot as any;
  const lines: any[] = snapshot.lines ?? [];

  const palletIds = lines.map((l: any) => l.palletId);
  const pallets = await prisma.pallet.findMany({ where: { id: { in: palletIds } } });
  const palletMap = new Map(pallets.map(p => [p.id, p]));

  for (const line of lines) {
    const pallet = palletMap.get(line.palletId);
    if (!pallet) throw new GatePassVoidError(`Pallet ${line.palletId} no longer exists`, 404);
    if (Number(pallet.cartons) < line.cartonsOut) {
      throw new GatePassVoidError(
        `Cannot restore OGP — pallet ${line.palletId} has only ${pallet.cartons} cartons, need ${line.cartonsOut}`
      );
    }
  }

  const ops: any[] = lines.map((line: any) => {
    const pallet = palletMap.get(line.palletId)!;
    const remaining = Number(pallet.cartons) - line.cartonsOut;
    const wtPer = line.weightPerCarton ?? Number(pallet.weightPerCarton); // Use snapshot weight if available
    return prisma.pallet.update({
      where: { id: line.palletId },
      data: {
        cartons: remaining,
        totalWeight: remaining * wtPer,
        status: remaining <= 0 ? 'dispatched' : 'active',
      },
    });
  });

  ops.push(
    prisma.stockMovement.updateMany({
      where: { docNumber: ogpNumber, type: 'OUT' },
      data: { status: 'active', voidedAt: null, voidedBy: null, voidReason: null },
    })
  );

  await prisma.$transaction(ops);
  return { ogpNumber, status: 'active', restoredBy, palletCount: lines.length };
}

async function checkLocationConflicts(pallets: any[]) {
  for (const p of pallets) {
    if (p.room === 'Ante Room') continue;
    const conflict = await prisma.pallet.findFirst({
      where: {
        id: { not: p.id },
        status: 'active',
        room: p.room,
        side: p.side,
        row: p.row,
        slot: p.slot,
        position: p.position ?? null,
      },
    });
    if (conflict) {
      throw new GatePassVoidError(
        `Cannot restore IGP — location ${p.room} ${p.side}${p.row}-${p.slot} occupied by ${conflict.id}. Move that pallet first.`
      );
    }
  }
}

export async function voidIGP(igpNumber: string, voidedBy: string, reason: string) {
  if (!reason || reason.trim().length < 3) {
    throw new GatePassVoidError('Reason is required (min 3 characters)');
  }

  const pallets = await prisma.pallet.findMany({ where: { igpNumber } });
  if (pallets.length === 0) throw new GatePassVoidError('IGP not found', 404);

  const movements = await prisma.stockMovement.findMany({
    where: { docNumber: igpNumber, type: 'IN' },
  });
  if (movements.some(m => m.status === 'voided')) {
    throw new GatePassVoidError('IGP is already voided');
  }

  const palletIds = pallets.map(p => p.id);
  const activeOuts = await prisma.stockMovement.findMany({
    where: { palletId: { in: palletIds }, type: 'OUT', status: 'active' },
    select: { docNumber: true },
  });
  if (activeOuts.length > 0) {
    const ogpNums = [...new Set(activeOuts.map(m => m.docNumber))];
    throw new GatePassVoidError(`Undo related OGP first: ${ogpNums.join(', ')}`);
  }

  const snapshot = {
    igpNumber,
    docType: 'IN',
    pallets: pallets.map(serializePallet),
    movements: movements.map(serializeMovement),
    voidedAt: new Date().toISOString(),
  };

  const now = new Date();

  await prisma.$transaction([
    ...palletIds.map(id =>
      prisma.pallet.update({
        where: { id },
        data: { status: 'voided', voidedAt: now },
      })
    ),
    prisma.stockMovement.updateMany({
      where: { docNumber: igpNumber, type: 'IN' },
      data: { status: 'voided', voidedAt: now, voidedBy, voidReason: reason.trim() },
    }),
    prisma.gatePassSnapshot.upsert({
      where: { docNumber: igpNumber },
      create: {
        docNumber: igpNumber,
        docType: 'IN',
        snapshot,
        voidedBy,
        voidReason: reason.trim(),
        voidedAt: now,
      },
      update: {
        snapshot,
        voidedBy,
        voidReason: reason.trim(),
        voidedAt: now,
      },
    }),
  ]);

  return { igpNumber, status: 'voided', palletCount: pallets.length };
}

export async function restoreIGP(igpNumber: string, restoredBy: string) {
  const pallets = await prisma.pallet.findMany({ where: { igpNumber } });
  if (pallets.length === 0) throw new GatePassVoidError('IGP not found', 404);
  if (!pallets.every(p => p.status === 'voided')) {
    throw new GatePassVoidError('IGP is not fully voided — nothing to restore');
  }

  const movements = await prisma.stockMovement.findMany({
    where: { docNumber: igpNumber, type: 'IN' },
  });
  if (!movements.every(m => m.status === 'voided')) {
    throw new GatePassVoidError('IGP movements are not voided');
  }

  const snapRecord = await prisma.gatePassSnapshot.findUnique({ where: { docNumber: igpNumber } });
  if (!snapRecord) throw new GatePassVoidError('No snapshot found — cannot restore this IGP', 404);

  const snapshot = snapRecord.snapshot as any;
  const snapPallets: any[] = snapshot.pallets ?? [];

  await checkLocationConflicts(snapPallets);

  await prisma.$transaction([
    ...snapPallets.map(sp =>
      prisma.pallet.update({
        where: { id: sp.id },
        data: {
          status: 'active',
          voidedAt: null,
          // Restore all pallet fields from snapshot
          igpNumber: sp.igpNumber,
          vehicleNo: sp.vehicleNo,
          driverName: sp.driverName,
          driverId: sp.driverId,
          sealNumber: sp.sealNumber,
          productId: sp.productId,
          customerId: sp.customerId,
          productName: sp.productName,
          productCode: sp.productCode,
          customerName: sp.customerName,
          cartons: sp.cartons,
          weightPerCarton: sp.weightPerCarton,
          totalWeight: sp.totalWeight,
          packingType: sp.packingType,
          mfgDate: sp.mfgDate ? new Date(sp.mfgDate) : undefined,
          expiryDate: sp.expiryDate ? new Date(sp.expiryDate) : undefined,
          batchNo: sp.batchNo,
          lotNo: sp.lotNo,
          orderRef: sp.orderRef,
          dateIn: sp.dateIn ? new Date(sp.dateIn) : undefined,
          timeIn: sp.timeIn,
          departureTime: sp.departureTime,
          ...(sp.room ? {
            room: sp.room,
            side: sp.side,
            row: sp.row,
            slot: sp.slot,
            position: sp.position ?? undefined,
          } : {}),
          condition: sp.condition,
          temperatureAtReceipt: sp.temperatureAtReceipt,
          productTemperature: sp.productTemperature,
          notes: sp.notes,
          revised: sp.revised,
          revisedAt: sp.revisedAt ? new Date(sp.revisedAt) : undefined,
        },
      })
    ),
    prisma.stockMovement.updateMany({
      where: { docNumber: igpNumber, type: 'IN' },
      data: { status: 'active', voidedAt: null, voidedBy: null, voidReason: null },
    }),
  ]);

  return { igpNumber, status: 'active', restoredBy, palletCount: snapPallets.length };
}
