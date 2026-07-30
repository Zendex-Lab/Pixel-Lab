-- Create the alliances table
CREATE TABLE public.alliances (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(24) NOT NULL UNIQUE,
  description VARCHAR(200),
  emoji VARCHAR(8) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES public.user_profiles(id)
);

-- Create the alliance_members table
CREATE TYPE public.alliance_role AS ENUM ('owner', 'member');

CREATE TABLE public.alliance_members (
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role public.alliance_role DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (alliance_id, user_id),
  CONSTRAINT one_alliance_per_user UNIQUE (user_id) -- Ensures a user is in only ONE alliance at a time
);

-- Row Level Security
ALTER TABLE public.alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_members ENABLE ROW LEVEL SECURITY;

-- Policies for alliances
CREATE POLICY "Alliances are viewable by everyone" ON public.alliances
  FOR SELECT USING (true);

-- Policies for alliance_members
CREATE POLICY "Alliance members are viewable by everyone" ON public.alliance_members
  FOR SELECT USING (true);


-- RPC: create_alliance
CREATE OR REPLACE FUNCTION public.create_alliance(p_name VARCHAR(24), p_description VARCHAR(200), p_emoji VARCHAR(8))
RETURNS UUID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_alliance_id UUID;
  v_existing_alliance UUID;
BEGIN
  -- Check if user is already in an alliance
  SELECT alliance_id INTO v_existing_alliance FROM public.alliance_members WHERE user_id = v_user_id;
  IF FOUND THEN
    RAISE EXCEPTION 'User is already in an alliance';
  END IF;

  -- Insert the new alliance
  INSERT INTO public.alliances (name, description, emoji, owner_id)
  VALUES (p_name, p_description, p_emoji, v_user_id)
  RETURNING id INTO v_alliance_id;

  -- Add the creator as the owner in alliance_members
  INSERT INTO public.alliance_members (alliance_id, user_id, role)
  VALUES (v_alliance_id, v_user_id, 'owner');

  RETURN v_alliance_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: join_alliance
CREATE OR REPLACE FUNCTION public.join_alliance(p_alliance_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_alliance UUID;
BEGIN
  -- Check if user is already in an alliance
  SELECT alliance_id INTO v_existing_alliance FROM public.alliance_members WHERE user_id = v_user_id;
  IF FOUND THEN
    RAISE EXCEPTION 'User is already in an alliance';
  END IF;

  -- Add the user to the alliance as a member
  INSERT INTO public.alliance_members (alliance_id, user_id, role)
  VALUES (p_alliance_id, v_user_id, 'member');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: leave_alliance
CREATE OR REPLACE FUNCTION public.leave_alliance()
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_alliance_id UUID;
  v_role public.alliance_role;
  v_member_count INT;
BEGIN
  -- Get user's alliance and role
  SELECT alliance_id, role INTO v_alliance_id, v_role
  FROM public.alliance_members
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not in an alliance';
  END IF;

  IF v_role = 'owner' THEN
    -- Check if there are other members
    SELECT COUNT(*) INTO v_member_count FROM public.alliance_members WHERE alliance_id = v_alliance_id;
    IF v_member_count > 1 THEN
      RAISE EXCEPTION 'Owner cannot leave while other members exist. Transfer ownership or kick members first.';
    ELSE
      -- Disband alliance if only member
      DELETE FROM public.alliances WHERE id = v_alliance_id;
      RETURN TRUE;
    END IF;
  END IF;

  -- If not owner, just remove from members
  DELETE FROM public.alliance_members WHERE alliance_id = v_alliance_id AND user_id = v_user_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: transfer_alliance_ownership
CREATE OR REPLACE FUNCTION public.transfer_alliance_ownership(p_target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_alliance_id UUID;
  v_role public.alliance_role;
  v_target_role public.alliance_role;
BEGIN
  -- Get user's alliance and role
  SELECT alliance_id, role INTO v_alliance_id, v_role
  FROM public.alliance_members
  WHERE user_id = v_user_id;

  IF NOT FOUND OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Only the alliance owner can transfer ownership';
  END IF;

  -- Check if target user is in the same alliance
  SELECT role INTO v_target_role
  FROM public.alliance_members
  WHERE user_id = p_target_user_id AND alliance_id = v_alliance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not in the same alliance';
  END IF;

  -- Update target user to owner
  UPDATE public.alliance_members SET role = 'owner' WHERE user_id = p_target_user_id AND alliance_id = v_alliance_id;
  -- Update current user to member
  UPDATE public.alliance_members SET role = 'member' WHERE user_id = v_user_id AND alliance_id = v_alliance_id;
  -- Update owner_id in alliances table
  UPDATE public.alliances SET owner_id = p_target_user_id WHERE id = v_alliance_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: kick_alliance_member
CREATE OR REPLACE FUNCTION public.kick_alliance_member(p_target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_alliance_id UUID;
  v_role public.alliance_role;
BEGIN
  -- Get user's alliance and role
  SELECT alliance_id, role INTO v_alliance_id, v_role
  FROM public.alliance_members
  WHERE user_id = v_user_id;

  IF NOT FOUND OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Only the alliance owner can kick members';
  END IF;

  -- Cannot kick self (use leave_alliance for that)
  IF p_target_user_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot kick yourself';
  END IF;

  -- Remove target user
  DELETE FROM public.alliance_members WHERE user_id = p_target_user_id AND alliance_id = v_alliance_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
