-- =====================================================================
-- 0043_financial_reports
-- Financial reports for Teacher (mr_walid) vs Admin.
-- Single source of truth: unit_purchases (+ unit_codes + unit_pricing).
--   * Incoming  = active unit_purchases (base_price -> teacher,
--                 platform_fee -> platform, total = both)
--   * Outgoing  = platform_expenses (admin-registered operating costs) +
--                 platform_payouts (transfers to teacher).
--   * Pending   = available unit_codes * snapshot price (expected revenue)
--   * Void/lost = revoked codes + purchases status='void'
--
-- New objects:
--   * platform_expenses  - admin-only expense ledger
--   * platform_payouts   - admin-only payout ledger (to mr_walid)
--   * get_financial_reports(p_from, p_to, p_grade_id, p_unit_id)
--        -> jsonb with summary/by_grade/by_unit/daily/recent/code_stats
--   * add_platform_expense / list_platform_expenses
--   * add_platform_payout  / list_platform_payouts
-- All RPCs are SECURITY DEFINER with explicit role guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Expense ledger (outgoing - operating costs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_expenses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    amount      numeric(10, 2) NOT NULL CHECK (amount > 0),
    category    text NOT NULL CHECK (length(btrim(category)) > 0),
    description text,
    spent_at    timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_expenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_expenses_select_staff ON public.platform_expenses;
CREATE POLICY platform_expenses_select_staff ON public.platform_expenses
    FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS platform_expenses_no_direct_insert ON public.platform_expenses;
CREATE POLICY platform_expenses_no_direct_insert ON public.platform_expenses
    FOR INSERT WITH CHECK (false);

COMMENT ON TABLE public.platform_expenses IS 'Admin-registered operating expenses (Bunny/Supabase/domain/ads). Writes via add_platform_expense only.';

-- ---------------------------------------------------------------------
-- 2) Payout ledger (outgoing - transfers to teacher)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_payouts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    amount       numeric(10, 2) NOT NULL CHECK (amount > 0),
    recipient_id uuid REFERENCES public.profiles(id),
    note         text,
    paid_at      timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES auth.users(id),
    created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payouts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_payouts_select_staff ON public.platform_payouts;
CREATE POLICY platform_payouts_select_staff ON public.platform_payouts
    FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS platform_payouts_no_direct_insert ON public.platform_payouts;
CREATE POLICY platform_payouts_no_direct_insert ON public.platform_payouts
    FOR INSERT WITH CHECK (false);

COMMENT ON TABLE public.platform_payouts IS 'Transfers from platform to teacher. Writes via add_platform_payout only.';

-- ---------------------------------------------------------------------
-- 3) Triggers: updated_at not needed (immutable ledger), audit only
-- ---------------------------------------------------------------------
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['platform_expenses', 'platform_payouts'] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', v_table);
    EXECUTE format('CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', v_table);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4) RPC: add_platform_expense (admin only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_platform_expense(
    p_amount numeric(10,2),
    p_category text,
    p_description text DEFAULT NULL,
    p_spent_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_category IS NULL OR btrim(p_category) = '' THEN RAISE EXCEPTION 'category_required'; END IF;
  INSERT INTO public.platform_expenses (amount, category, description, spent_at, created_by)
  VALUES (p_amount, btrim(p_category), NULLIF(btrim(COALESCE(p_description,'')),''), COALESCE(p_spent_at, now()), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.audit_log('platform_expense.create','platform_expenses',v_id, jsonb_build_object('amount',p_amount,'category',p_category));
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.add_platform_expense(numeric,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_platform_expense(numeric,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_platform_expenses(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL
) RETURNS TABLE (id uuid, amount numeric(10,2), category text, description text, spent_at timestamptz, created_at timestamptz, created_by uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_mr_walid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  RETURN QUERY SELECT e.id, e.amount, e.category, e.description, e.spent_at, e.created_at, e.created_by
  FROM public.platform_expenses e
  WHERE (p_from IS NULL OR e.spent_at >= p_from) AND (p_to IS NULL OR e.spent_at <= p_to)
  ORDER BY e.spent_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.list_platform_expenses(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_expenses(timestamptz,timestamptz) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC: add_platform_payout (admin only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_platform_payout(
    p_amount numeric(10,2),
    p_note text DEFAULT NULL,
    p_paid_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
DECLARE v_recipient uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT id INTO v_recipient FROM public.profiles WHERE role='mr_walid' AND deleted_at IS NULL LIMIT 1;
  INSERT INTO public.platform_payouts (amount, recipient_id, note, paid_at, created_by)
  VALUES (p_amount, v_recipient, NULLIF(btrim(COALESCE(p_note,'')),''), COALESCE(p_paid_at, now()), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.audit_log('platform_payout.create','platform_payouts',v_id, jsonb_build_object('amount',p_amount));
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.add_platform_payout(numeric,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_platform_payout(numeric,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_platform_payouts(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL
) RETURNS TABLE (id uuid, amount numeric(10,2), note text, paid_at timestamptz, created_at timestamptz, recipient_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_mr_walid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  RETURN QUERY SELECT p.id, p.amount, p.note, p.paid_at, p.created_at, p.recipient_id
  FROM public.platform_payouts p
  WHERE (p_from IS NULL OR p.paid_at >= p_from) AND (p_to IS NULL OR p.paid_at <= p_to)
  ORDER BY p.paid_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.list_platform_payouts(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_payouts(timestamptz,timestamptz) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) RPC: get_financial_reports (staff - teacher + admin share same data)
-- Filters: p_from, p_to (on purchased_at), p_grade_id, p_unit_id
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_reports(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL,
    p_grade_id uuid DEFAULT NULL,
    p_unit_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- validate grade/unit existence when filtered
  IF p_grade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grades WHERE id=p_grade_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'grade_not_found';
  END IF;
  IF p_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.units WHERE id=p_unit_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'unit_not_found';
  END IF;

  SELECT jsonb_build_object(
    'filters', jsonb_build_object('from', p_from, 'to', p_to, 'grade_id', p_grade_id, 'unit_id', p_unit_id),
    'summary', jsonb_build_object(
        'total_purchases', (SELECT count(*) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_base',      (SELECT COALESCE(sum(up.base_price),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_platform_fee', (SELECT COALESCE(sum(up.platform_fee),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_revenue',   (SELECT COALESCE(sum(up.total_price),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'avg_ticket',      (SELECT COALESCE(round(avg(up.total_price),2),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'void_purchases',  (SELECT count(*) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='void' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'expenses_total',  (SELECT COALESCE(sum(amount),0) FROM public.platform_expenses WHERE (p_from IS NULL OR spent_at>=p_from) AND (p_to IS NULL OR spent_at<=p_to)),
        'payouts_total',   (SELECT COALESCE(sum(amount),0) FROM public.platform_payouts WHERE (p_from IS NULL OR paid_at>=p_from) AND (p_to IS NULL OR paid_at<=p_to)),
        'net_platform',    (SELECT COALESCE(sum(up.platform_fee),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)) - (SELECT COALESCE(sum(amount),0) FROM public.platform_expenses WHERE (p_from IS NULL OR spent_at>=p_from) AND (p_to IS NULL OR spent_at<=p_to)) - (SELECT COALESCE(sum(amount),0) FROM public.platform_payouts WHERE (p_from IS NULL OR paid_at>=p_from) AND (p_to IS NULL OR paid_at<=p_to))
    ),
    'by_grade', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('grade_id', r.grade_id,'grade_name',r.grade_name,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.sort_order)
        FROM (
          SELECT g.id as grade_id, g.name as grade_name, g.sort_order,
                 count(up.id) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.grades g
          LEFT JOIN public.units u ON u.grade_id=g.id AND u.deleted_at IS NULL AND (p_unit_id IS NULL OR u.id=p_unit_id)
          LEFT JOIN public.unit_purchases up ON up.unit_id=u.id AND up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to)
          WHERE g.deleted_at IS NULL AND (p_grade_id IS NULL OR g.id=p_grade_id)
          GROUP BY g.id,g.name,g.sort_order
        ) r
    ),'[]'::jsonb),
    'by_unit', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('unit_id',r.unit_id,'unit_name',r.unit_name,'grade_name',r.grade_name,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.total_revenue DESC)
        FROM (
          SELECT u.id as unit_id, u.name as unit_name, g.name as grade_name,
                 count(up.id) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.units u
          JOIN public.grades g ON g.id=u.grade_id
          LEFT JOIN public.unit_purchases up ON up.unit_id=u.id AND up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to)
          WHERE u.deleted_at IS NULL AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)
          GROUP BY u.id,u.name,g.name
        ) r
        WHERE r.purchases > 0
    ),'[]'::jsonb),
    'daily', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('date',r.d,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.d)
        FROM (
          SELECT date_trunc('day', up.purchased_at)::date as d,
                 count(*) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.unit_purchases up
          JOIN public.units u ON u.id=up.unit_id
          WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)
          GROUP BY date_trunc('day', up.purchased_at)::date
          ORDER BY d DESC LIMIT 30
        ) r
    ),'[]'::jsonb),
    'code_stats', jsonb_build_object(
        'available', (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'used',      (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='used' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'revoked',   (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='revoked' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'pending_base', (SELECT COALESCE(sum(up.base_price),0) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'pending_total',(SELECT COALESCE(sum(up.total_price),0) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id))
    ),
    'recent_purchases', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('student_name',p.full_name,'grade_name',g.name,'unit_name',u.name,'base_price',up.base_price,'platform_fee',up.platform_fee,'total_price',up.total_price,'purchased_at',up.purchased_at) ORDER BY up.purchased_at DESC)
        FROM public.unit_purchases up
        JOIN public.profiles p ON p.id=up.student_id
        JOIN public.units u ON u.id=up.unit_id
        JOIN public.grades g ON g.id=u.grade_id
        WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)
        LIMIT 10
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_financial_reports(timestamptz,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_financial_reports(timestamptz,timestamptz,uuid,uuid) TO authenticated;

-- RLS already asserted above; ensure grants on tables
GRANT SELECT ON public.platform_expenses TO authenticated;
GRANT SELECT ON public.platform_payouts TO authenticated;
