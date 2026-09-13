-- Persist task placement on the freeform board.
ALTER TABLE tasks ADD COLUMN freeform_x REAL;
ALTER TABLE tasks ADD COLUMN freeform_y REAL;
