-- Add vault PIN to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS vault_pin_hash text;

-- Add soft deletion to content_submissions
ALTER TABLE public.content_submissions
ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Create RPC to securely verify a user's password utilizing PostgreSQL's pgcrypto extension over auth.users
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.verify_user_password(password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _user_id uuid;
  _hash text;
  _is_valid boolean;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT encrypted_password INTO _hash FROM auth.users WHERE id = _user_id;
  
  IF _hash IS NULL THEN
    RETURN false;
  END IF;

  _is_valid := (extensions.crypt(password, _hash) = _hash);
  RETURN _is_valid;
END;
$$;


-- Create RPC to securely set the vault PIN for the user
CREATE OR REPLACE FUNCTION public.create_vault_pin(pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _hashed_pin text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Hash the PIN using pgcrypto gen_salt('bf') (bcrypt)
  _hashed_pin := extensions.crypt(pin, extensions.gen_salt('bf'));

  UPDATE public.profiles
  SET vault_pin_hash = _hashed_pin
  WHERE id = _user_id;

  RETURN true;
END;
$$;


-- Create RPC to securely verify the vault PIN for the user
CREATE OR REPLACE FUNCTION public.verify_vault_pin(pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _stored_hash text;
  _is_valid boolean;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT vault_pin_hash INTO _stored_hash FROM public.profiles WHERE id = _user_id;
  
  IF _stored_hash IS NULL THEN
    RETURN false; -- PIN not set up yet
  END IF;

  _is_valid := (extensions.crypt(pin, _stored_hash) = _stored_hash);
  RETURN _is_valid;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_user_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vault_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_vault_pin(text) TO authenticated;
