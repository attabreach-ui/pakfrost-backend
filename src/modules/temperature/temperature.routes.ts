import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { sendSuccess, sendCreated, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

const createSchema = z.object({
  room:        z.string().min(1),
  temperature: z.number(),
  notes:       z.string().optional(),
  recordedBy:  z.string().optional(),
});

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { room, limit = '100' } = req.query;
    const data = await prisma.temperatureReading.findMany({
      where:   room ? { room: String(room) } : undefined,
      orderBy: { recordedAt: 'desc' },
      take:    Math.min(500, parseInt(String(limit))),
    });
    sendSuccess(res, data, `${data.length} readings`);
  } catch (err) { logger.error('temperature.getAll', err); sendServerError(res); }
});

router.get('/latest', async (_req: Request, res: Response) => {
  try {
    const rooms = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Ante Room'];
    const latest = await Promise.all(
      rooms.map(room =>
        prisma.temperatureReading.findFirst({
          where:   { room },
          orderBy: { recordedAt: 'desc' },
        })
      )
    );
    sendSuccess(res, latest.filter(Boolean), 'Latest readings per room');
  } catch (err) { logger.error('temperature.latest', err); sendServerError(res); }
});

router.post('/', validate(createSchema), async (req: Request, res: Response) => {
  try {
    const data = await prisma.temperatureReading.create({
      data: {
        room:        req.body.room,
        temperature: req.body.temperature,
        notes:       req.body.notes,
        recordedBy:  req.body.recordedBy || req.user?.username || 'Unknown',
      },
    });
    logger.info(`Temperature recorded: ${req.body.room} = ${req.body.temperature}°C`);
    sendCreated(res, data, 'Temperature recorded');
  } catch (err) { logger.error('temperature.create', err); sendServerError(res); }
});

export default router;
