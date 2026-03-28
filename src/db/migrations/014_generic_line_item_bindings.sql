DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'canvas_line_item_bindings'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'line_item_bindings'
  ) THEN
    ALTER TABLE canvas_line_item_bindings
      RENAME TO line_item_bindings;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'grade_publications'
      AND column_name = 'canvas_user_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'grade_publications'
      AND column_name = 'platform_user_id'
  ) THEN
    ALTER TABLE grade_publications
      RENAME COLUMN canvas_user_id TO platform_user_id;
  END IF;
END $$;
