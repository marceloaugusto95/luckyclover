-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_profile_cpf_set ON public.profiles;
DROP FUNCTION IF EXISTS public.link_bets_to_new_profile();

-- Create new function to link by phone
CREATE OR REPLACE FUNCTION public.link_bets_by_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        -- Link bets where client_phone matches the new profile's phone
        -- We assume phone numbers are stored formatted or we should clean them.
        -- Ideally, both should be cleaned digits, but let's try to match exactly first
        -- or update based on specific logic.
        -- Given frontend masks: (xx) 9xxxx-xxxx, we will expect exact match.
        UPDATE public.bets
        SET user_id = NEW.id
        WHERE client_phone = NEW.phone 
          AND user_id IS NULL;
    END IF;
    RETURN NEW;
END;
$function$;

-- Create new trigger
CREATE TRIGGER on_profile_phone_set
    AFTER INSERT OR UPDATE OF phone
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.link_bets_by_phone();
