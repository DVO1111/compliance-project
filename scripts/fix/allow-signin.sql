DO $$
BEGIN
  IF to_regclass('public.allowed_signins') IS NULL THEN
    RAISE NOTICE 'allowed_signins does not exist here, so the database gate is off and nothing is needed';
    RETURN;
  END IF;
  INSERT INTO public.allowed_signins (email, note)
  VALUES ('aeoladehinde@sterlinglams.com', 'test account')
  ON CONFLICT (email) DO NOTHING;
END $$;

SELECT email, note
FROM public.allowed_signins
ORDER BY email;
