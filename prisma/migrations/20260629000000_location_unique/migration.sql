-- Partial unique index: only active pallets in non-Ante-Room locations
-- Prevents two active pallets from occupying the same physical slot

CREATE UNIQUE INDEX IF NOT EXISTS pallets_location_unique_active
ON pallets(room, side, row, slot, position)
WHERE room != 'Ante Room' AND status = 'active';

-- Also add index on dateIn for FIFO queries
CREATE INDEX IF NOT EXISTS pallets_date_in_idx ON pallets(date_in);
