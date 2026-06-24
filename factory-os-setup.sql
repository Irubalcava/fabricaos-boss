-- ============================================================
-- FACTORY OS — SQL COMPLETO
-- Ejecutar en Supabase SQL Editor (orden secuencial)
-- ============================================================

-- ============================================================
-- 1. COLUMNAS NUEVAS EN fabricas
-- ============================================================

ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS boss_is_active          BOOLEAN DEFAULT false;
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS boss_subscription_status TEXT    DEFAULT 'inactive';
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT;
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT;
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS descripcion              TEXT;
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS color_primario           TEXT;

-- ============================================================
-- 2. COLUMNAS PENDIENTES EN TABLAS BOS_*
-- ============================================================

ALTER TABLE bos_tareas    ADD COLUMN IF NOT EXISTS area         TEXT;
ALTER TABLE bos_tareas    ADD COLUMN IF NOT EXISTS objetivo_id  UUID REFERENCES bos_objetivos(id) ON DELETE SET NULL;

ALTER TABLE bos_reuniones ADD COLUMN IF NOT EXISTS resumen_ia   TEXT;

ALTER TABLE bos_problemas ADD COLUMN IF NOT EXISTS fecha_limite DATE;
ALTER TABLE bos_problemas ADD COLUMN IF NOT EXISTS objetivo_id  UUID REFERENCES bos_objetivos(id) ON DELETE SET NULL;

ALTER TABLE bos_ideas     ADD COLUMN IF NOT EXISTS objetivo_id   UUID REFERENCES bos_objetivos(id) ON DELETE SET NULL;
ALTER TABLE bos_ideas     ADD COLUMN IF NOT EXISTS impacto_nivel TEXT DEFAULT 'medio';
ALTER TABLE bos_ideas     ADD COLUMN IF NOT EXISTS responsable   TEXT;

ALTER TABLE bos_kpis      ADD COLUMN IF NOT EXISTS responsable  TEXT;
ALTER TABLE bos_kpis      ADD COLUMN IF NOT EXISTS area         TEXT;
ALTER TABLE bos_kpis      ADD COLUMN IF NOT EXISTS plan         TEXT;

ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS sucursal_id  UUID REFERENCES bos_sucursales(id) ON DELETE SET NULL;

-- ============================================================
-- 3. TABLA: workspace_modulos (control granular de módulos)
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_modulos (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  fabrica_id       UUID        NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  modulo           TEXT        NOT NULL,   -- 'ventas','produccion','rh','boss','inventario',etc.
  activo           BOOLEAN     DEFAULT true,
  fecha_activacion TIMESTAMPTZ DEFAULT now(),
  fecha_expiracion TIMESTAMPTZ,
  meta             JSONB       DEFAULT '{}',
  UNIQUE(fabrica_id, modulo)
);

-- ============================================================
-- 4. FUNCIÓN HELPER: is_boss_member
-- Verifica que el usuario autenticado tiene rol Boss en el workspace
-- ============================================================

CREATE OR REPLACE FUNCTION is_boss_member(p_fabrica_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   colaboradores c
    WHERE  c.fabrica_id  = p_fabrica_id
      AND  c.profile_id  = auth.uid()
      AND  c.activo      IS NOT FALSE
      AND  c.boss_rol    IS NOT NULL
  );
$$;

-- ============================================================
-- 5. RLS — TABLAS BOS_* (habilitar + política única por tabla)
-- ============================================================

-- bos_tareas
ALTER TABLE bos_tareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_tareas;
CREATE POLICY "boss_member" ON bos_tareas
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_objetivos
ALTER TABLE bos_objetivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_objetivos;
CREATE POLICY "boss_member" ON bos_objetivos
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_key_results
ALTER TABLE bos_key_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_key_results;
CREATE POLICY "boss_member" ON bos_key_results
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_kpis
ALTER TABLE bos_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_kpis;
CREATE POLICY "boss_member" ON bos_kpis
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_kpi_mediciones
ALTER TABLE bos_kpi_mediciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_kpi_mediciones;
CREATE POLICY "boss_member" ON bos_kpi_mediciones
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_reuniones
ALTER TABLE bos_reuniones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_reuniones;
CREATE POLICY "boss_member" ON bos_reuniones
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_acuerdos_reunion (join por reunion_id → bos_reuniones)
ALTER TABLE bos_acuerdos_reunion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_acuerdos_reunion;
CREATE POLICY "boss_member" ON bos_acuerdos_reunion
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bos_reuniones r
      WHERE  r.id = bos_acuerdos_reunion.reunion_id
        AND  is_boss_member(r.fabrica_id)
    )
  );

-- bos_decisiones
ALTER TABLE bos_decisiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_decisiones;
CREATE POLICY "boss_member" ON bos_decisiones
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_votos_decision (join por decision_id → bos_decisiones)
ALTER TABLE bos_votos_decision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_votos_decision;
CREATE POLICY "boss_member" ON bos_votos_decision
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bos_decisiones d
      WHERE  d.id = bos_votos_decision.decision_id
        AND  is_boss_member(d.fabrica_id)
    )
  );

-- bos_problemas
ALTER TABLE bos_problemas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_problemas;
CREATE POLICY "boss_member" ON bos_problemas
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_ideas
ALTER TABLE bos_ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_ideas;
CREATE POLICY "boss_member" ON bos_ideas
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_bitacora
ALTER TABLE bos_bitacora ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_bitacora;
CREATE POLICY "boss_member" ON bos_bitacora
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_sucursales
ALTER TABLE bos_sucursales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_member" ON bos_sucursales;
CREATE POLICY "boss_member" ON bos_sucursales
  FOR ALL USING (is_boss_member(fabrica_id));

-- bos_notificaciones (solo el destinatario)
ALTER TABLE bos_notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_notif" ON bos_notificaciones;
CREATE POLICY "boss_notif" ON bos_notificaciones
  FOR ALL USING (
    destinatario_id = auth.uid()
    AND is_boss_member(fabrica_id)
  );

-- workspace_modulos (lectura: cualquier miembro Boss | escritura: owner/admin)
ALTER TABLE workspace_modulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_read"  ON workspace_modulos;
DROP POLICY IF EXISTS "boss_write" ON workspace_modulos;
CREATE POLICY "boss_read" ON workspace_modulos
  FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_write" ON workspace_modulos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM colaboradores c
      WHERE  c.fabrica_id = workspace_modulos.fabrica_id
        AND  c.profile_id = auth.uid()
        AND  c.boss_rol   IN ('owner','admin')
        AND  c.activo     IS NOT FALSE
    )
  );

-- ============================================================
-- 6. RPC: bos_dashboard_completo
-- Un solo query que reemplaza los 9+ queries del dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION bos_dashboard_completo(
  p_fabrica_id  UUID,
  p_sucursal_id UUID    DEFAULT NULL,
  p_fecha       DATE    DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tareas_count   INT;
  v_tareas_vencidas INT;
  v_objetivos      JSONB;
  v_kpis           JSONB;
  v_problemas      JSONB;
  v_reuniones      JSONB;
  v_ideas          JSONB;
BEGIN
  IF NOT is_boss_member(p_fabrica_id) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  -- Tareas activas
  SELECT COUNT(*) INTO v_tareas_count
  FROM   bos_tareas
  WHERE  fabrica_id = p_fabrica_id
    AND  (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id OR sucursal_id IS NULL)
    AND  estado NOT IN ('hecha','cancelada');

  -- Tareas vencidas
  SELECT COUNT(*) INTO v_tareas_vencidas
  FROM   bos_tareas
  WHERE  fabrica_id  = p_fabrica_id
    AND  (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id OR sucursal_id IS NULL)
    AND  fecha_limite < p_fecha
    AND  estado NOT IN ('hecha','cancelada');

  -- Objetivos activos con progreso y tareas pendientes
  SELECT COALESCE(jsonb_agg(obj ORDER BY obj.created_at DESC), '[]'::jsonb)
  INTO   v_objetivos
  FROM (
    SELECT
      o.id, o.titulo, o.descripcion, o.estado, o.fecha_fin, o.area,
      COALESCE((
        SELECT ROUND(AVG(kr.progreso)::numeric, 0)
        FROM   bos_key_results kr
        WHERE  kr.objetivo_id = o.id
      ), 0)::int AS progreso,
      COALESCE((
        SELECT COUNT(*)
        FROM   bos_tareas t
        WHERE  t.objetivo_id = o.id
          AND  t.estado NOT IN ('hecha','cancelada')
      ), 0)::int AS tareas_pendientes,
      o.created_at
    FROM bos_objetivos o
    WHERE o.fabrica_id = p_fabrica_id
      AND o.estado     = 'activo'
    LIMIT 5
  ) obj;

  -- KPIs con última medición
  SELECT COALESCE(jsonb_agg(k ORDER BY k.nombre), '[]'::jsonb)
  INTO   v_kpis
  FROM (
    SELECT
      k.id, k.nombre, k.unidad, k.meta, k.area,
      COALESCE((
        SELECT m.valor
        FROM   bos_kpi_mediciones m
        WHERE  m.kpi_id = k.id
        ORDER BY m.fecha DESC LIMIT 1
      ), 0) AS valor_actual,
      (
        SELECT m.fecha
        FROM   bos_kpi_mediciones m
        WHERE  m.kpi_id = k.id
        ORDER BY m.fecha DESC LIMIT 1
      ) AS ultima_medicion
    FROM bos_kpis k
    WHERE k.fabrica_id = p_fabrica_id
      AND k.activo     = true
    LIMIT 8
  ) k;

  -- Problemas abiertos (por prioridad)
  SELECT COALESCE(jsonb_agg(p ORDER BY
    CASE p.prioridad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
    p.created_at DESC
  ), '[]'::jsonb)
  INTO v_problemas
  FROM (
    SELECT id, titulo, prioridad, estado, area, created_at
    FROM   bos_problemas
    WHERE  fabrica_id = p_fabrica_id
      AND  estado NOT IN ('resuelto','descartado')
    LIMIT 5
  ) p;

  -- Próximas reuniones
  SELECT COALESCE(jsonb_agg(r ORDER BY r.fecha ASC), '[]'::jsonb)
  INTO v_reuniones
  FROM (
    SELECT id, titulo, fecha, duracion_min, tipo
    FROM   bos_reuniones
    WHERE  fabrica_id = p_fabrica_id
      AND  fecha      >= p_fecha
    ORDER BY fecha ASC
    LIMIT 3
  ) r;

  -- Ideas recientes activas
  SELECT COALESCE(jsonb_agg(i ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_ideas
  FROM (
    SELECT id, titulo, estado, impacto_nivel, created_at
    FROM   bos_ideas
    WHERE  fabrica_id = p_fabrica_id
      AND  estado    != 'descartada'
    LIMIT 5
  ) i;

  RETURN jsonb_build_object(
    'tareas_activas',    v_tareas_count,
    'tareas_vencidas',   v_tareas_vencidas,
    'objetivos',         v_objetivos,
    'kpis',              v_kpis,
    'problemas',         v_problemas,
    'proximas_reuniones', v_reuniones,
    'ideas_recientes',   v_ideas,
    'generado_en',       now()
  );
END;
$$;

-- ============================================================
-- GRANT: permitir que la función sea llamada por usuarios autenticados
-- ============================================================

GRANT EXECUTE ON FUNCTION is_boss_member(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION bos_dashboard_completo(UUID,UUID,DATE) TO authenticated;
GRANT ALL     ON TABLE workspace_modulos                     TO authenticated;
