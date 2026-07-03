CREATE OR REPLACE FUNCTION public.link_bets_by_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    clean_new_phone text;
BEGIN
    IF NEW.phone IS NOT NULL THEN
        -- Remove non-digits from new profile phone to be safe
        clean_new_phone := regexp_replace(NEW.phone, '\D', '', 'g');
        
        -- Update bets where cleaned client_phone matches cleaned new phone
        UPDATE public.bets
        SET user_id = NEW.id
        WHERE regexp_replace(client_phone, '\D', '', 'g') = clean_new_phone 
          AND user_id IS NULL;
    END IF;
    RETURN NEW;
END;
$function$;
