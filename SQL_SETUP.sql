-- ============================================================
-- Business OS — SQL_SETUP.sql  (versión idempotente)
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- -----------------------------------------------
-- 0. EXTENSIONES
-- -----------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------
-- 1. COLUMNAS EXTRA EN TABLAS EXISTENTES
-- -----------------------------------------------
-- fabricas: slug para routing, giro para categoría
ALTER TABLE fabricas
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS giro TEXT;

-- colaboradores: boss_rol y activo para Business OS
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS boss_rol TEXT CHECK (boss_rol IN ('owner','admin','miembro','viewer')),
  ADD COLUMN IF NOT EXISTS activo   BOOLEAN DEFAULT TRUE;

-- -----------------------------------------------
-- 2. DROP TABLAS bos_* (orden inverso por FK)
-- -----------------------------------------------
DROP TABLE IF EXISTS bos_notificaciones     CASCADE;
DROP TABLE IF EXISTS bos_bitacora           CASCADE;
DROP TABLE IF EXISTS bos_votos_decision     CASCADE;
DROP TABLE IF EXISTS bos_decisiones         CASCADE;
DROP TABLE IF EXISTS bos_acuerdos_reunion   CASCADE;
DROP TABLE IF EXISTS bos_reuniones          CASCADE;
DROP TABLE IF EXISTS bos_key_results        CASCADE;
DROP TABLE IF EXISTS bos_objetivos          CASCADE;
DROP TABLE IF EXISTS bos_kpi_mediciones     CASCADE;
DROP TABLE IF EXISTS bos_kpis               CASCADE;
DROP TABLE IF EXISTS bos_ideas              CASCADE;
DROP TABLE IF EXISTS bos_problemas          CASCADE;
DROP TABLE IF EXISTS bos_tareas             CASCADE;

-- -----------------------------------------------
-- 3. TAREAS
-- -----------------------------------------------
CREATE TABLE bos_tareas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id   UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  descripcion  TEXT,
  estado       TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','en_progreso','bloqueada','hecha','cancelada')),
  prioridad    TEXT NOT NULL DEFAULT 'media'
                 CHECK (prioridad IN ('baja','media','alta','critica')),
  asignado_a   UUID REFERENCES auth.users(id),
  fecha_limite DATE,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_tareas_fabrica  ON bos_tareas(fabrica_id);
CREATE INDEX idx_bos_tareas_estado   ON bos_tareas(estado);
CREATE INDEX idx_bos_tareas_asignado ON bos_tareas(asignado_a);
CREATE INDEX idx_bos_tareas_limite   ON bos_tareas(fecha_limite);

-- -----------------------------------------------
-- 4. KPIs
-- -----------------------------------------------
CREATE TABLE bos_kpis (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id  UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  tipo        TEXT NOT NULL DEFAULT 'numero'
                CHECK (tipo IN ('numero','porcentaje','moneda','booleano')),
  meta        NUMERIC,
  unidad      TEXT,
  frecuencia  TEXT NOT NULL DEFAULT 'mensual'
                CHECK (frecuencia IN ('diario','semanal','mensual')),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_kpis_fabrica ON bos_kpis(fabrica_id);

CREATE TABLE bos_kpi_mediciones (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kpi_id     UUID NOT NULL REFERENCES bos_kpis(id) ON DELETE CASCADE,
  fabrica_id UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  valor      NUMERIC NOT NULL,
  fecha      DATE NOT NULL DEFAULT CURRENT_DATE,
  nota       TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_kpi_med_kpi   ON bos_kpi_mediciones(kpi_id);
CREATE INDEX idx_bos_kpi_med_fecha ON bos_kpi_mediciones(fecha);

-- -----------------------------------------------
-- 5. OBJETIVOS (OKR)
-- -----------------------------------------------
CREATE TABLE bos_objetivos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id   UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  descripcion  TEXT,
  responsable  UUID REFERENCES auth.users(id),
  fecha_inicio DATE,
  fecha_fin    DATE,
  periodicidad TEXT DEFAULT 'mensual'
                 CHECK (periodicidad IN ('semanal','mensual','trimestral','anual')),
  estado       TEXT NOT NULL DEFAULT 'activo'
                 CHECK (estado IN ('activo','en_pausa','completado','cancelado')),
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_objetivos_fabrica ON bos_objetivos(fabrica_id);

CREATE TABLE bos_key_results (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objetivo_id UUID NOT NULL REFERENCES bos_objetivos(id) ON DELETE CASCADE,
  fabrica_id  UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  meta        NUMERIC,
  progreso    NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_kr_objetivo ON bos_key_results(objetivo_id);

-- -----------------------------------------------
-- 6. REUNIONES
-- -----------------------------------------------
CREATE TABLE bos_reuniones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id  UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  tipo        TEXT DEFAULT 'semanal'
                CHECK (tipo IN ('semanal','mensual','extraordinaria','one_on_one','estratégica','otro')),
  fecha       DATE NOT NULL,
  hora_inicio TIME,
  hora_fin    TIME,
  descripcion TEXT,
  estado      TEXT NOT NULL DEFAULT 'programada'
                CHECK (estado IN ('programada','en_curso','realizada','cancelada')),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_reuniones_fabrica ON bos_reuniones(fabrica_id);
CREATE INDEX idx_bos_reuniones_fecha   ON bos_reuniones(fecha);

CREATE TABLE bos_acuerdos_reunion (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reunion_id  UUID NOT NULL REFERENCES bos_reuniones(id) ON DELETE CASCADE,
  fabrica_id  UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  completado  BOOLEAN DEFAULT FALSE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_acuerdos_reunion ON bos_acuerdos_reunion(reunion_id);

-- -----------------------------------------------
-- 7. DECISIONES
-- -----------------------------------------------
CREATE TABLE bos_decisiones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id   UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  problema     TEXT,
  opciones     TEXT,
  resultado    TEXT,
  estado       TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (estado IN ('borrador','votacion','aprobada','rechazada','postergada')),
  fecha_limite DATE,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_decisiones_fabrica ON bos_decisiones(fabrica_id);

CREATE TABLE bos_votos_decision (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES bos_decisiones(id) ON DELETE CASCADE,
  fabrica_id  UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  votante_id  UUID NOT NULL REFERENCES auth.users(id),
  voto        TEXT NOT NULL CHECK (voto IN ('si','no','abstencion')),
  comentario  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (decision_id, votante_id)
);

CREATE INDEX idx_bos_votos_decision ON bos_votos_decision(decision_id);

-- -----------------------------------------------
-- 8. PROBLEMAS
-- -----------------------------------------------
CREATE TABLE bos_problemas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id  UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  descripcion TEXT,
  impacto     TEXT NOT NULL DEFAULT 'medio'
                CHECK (impacto IN ('bajo','medio','alto','critico')),
  estado      TEXT NOT NULL DEFAULT 'detectado'
                CHECK (estado IN ('detectado','analizando','en_solucion','resuelto','descartado')),
  causas      TEXT[],
  solucion    TEXT,
  responsable UUID REFERENCES auth.users(id),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_problemas_fabrica ON bos_problemas(fabrica_id);
CREATE INDEX idx_bos_problemas_estado  ON bos_problemas(estado);

-- -----------------------------------------------
-- 9. IDEAS
-- -----------------------------------------------
CREATE TABLE bos_ideas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id        UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  titulo            TEXT NOT NULL,
  descripcion       TEXT,
  categoria         TEXT DEFAULT 'otro'
                      CHECK (categoria IN ('proceso','producto','marketing','tecnologia','personas','finanzas','cliente','otro')),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','evaluando','aprobada','en_desarrollo','implementada','descartada')),
  impacto_estimado  TEXT,
  esfuerzo_estimado TEXT DEFAULT 'medio' CHECK (esfuerzo_estimado IN ('bajo','medio','alto')),
  problema_id       UUID REFERENCES bos_problemas(id) ON DELETE SET NULL,
  votos_positivos   INTEGER DEFAULT 0,
  votos_negativos   INTEGER DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_ideas_fabrica ON bos_ideas(fabrica_id);
CREATE INDEX idx_bos_ideas_estado  ON bos_ideas(estado);

-- -----------------------------------------------
-- 10. BITÁCORA
-- -----------------------------------------------
CREATE TABLE bos_bitacora (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id  UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL DEFAULT 'general'
                CHECK (tipo IN ('general','tarea','kpi','objetivo','problema','idea','reunion','decision','workspace')),
  titulo      TEXT NOT NULL,
  descripcion TEXT,
  automatico  BOOLEAN DEFAULT FALSE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_bitacora_fabrica    ON bos_bitacora(fabrica_id);
CREATE INDEX idx_bos_bitacora_created_at ON bos_bitacora(created_at DESC);
CREATE INDEX idx_bos_bitacora_tipo       ON bos_bitacora(tipo);

-- -----------------------------------------------
-- 11. NOTIFICACIONES
-- -----------------------------------------------
CREATE TABLE bos_notificaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabrica_id      UUID NOT NULL REFERENCES fabricas(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES auth.users(id),
  tipo            TEXT NOT NULL DEFAULT 'info',
  titulo          TEXT NOT NULL,
  cuerpo          TEXT,
  leida           BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bos_notif_dest    ON bos_notificaciones(destinatario_id);
CREATE INDEX idx_bos_notif_fabrica ON bos_notificaciones(fabrica_id);
CREATE INDEX idx_bos_notif_leida   ON bos_notificaciones(leida);

-- -----------------------------------------------
-- 12. PROFILES
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT UNIQUE,
  nombre     TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

INSERT INTO profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- -----------------------------------------------
-- 13. FUNCIONES HELPER RLS
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION is_boss_member(p_fabrica_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM colaboradores
    WHERE fabrica_id = p_fabrica_id
      AND profile_id = auth.uid()
      AND boss_rol IS NOT NULL
      AND activo IS NOT FALSE
  );
$$;

CREATE OR REPLACE FUNCTION is_boss_admin(p_fabrica_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM colaboradores
    WHERE fabrica_id = p_fabrica_id
      AND profile_id = auth.uid()
      AND boss_rol IN ('owner','admin')
      AND activo IS NOT FALSE
  );
$$;

-- -----------------------------------------------
-- 14. ROW LEVEL SECURITY
-- -----------------------------------------------
ALTER TABLE bos_tareas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_kpis             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_kpi_mediciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_objetivos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_key_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_reuniones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_acuerdos_reunion ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_decisiones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_votos_decision   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_problemas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_ideas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_bitacora         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bos_notificaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;

-- TAREAS (tablas recién creadas, sin policies previas)
CREATE POLICY "boss_tareas_select" ON bos_tareas FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_tareas_insert" ON bos_tareas FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_tareas_update" ON bos_tareas FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_tareas_delete" ON bos_tareas FOR DELETE USING (is_boss_admin(fabrica_id));

-- KPIs
CREATE POLICY "boss_kpis_select" ON bos_kpis FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_kpis_insert" ON bos_kpis FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_kpis_update" ON bos_kpis FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_kpis_delete" ON bos_kpis FOR DELETE USING (is_boss_admin(fabrica_id));

-- KPI MEDICIONES
CREATE POLICY "boss_kpi_med_select" ON bos_kpi_mediciones FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_kpi_med_insert" ON bos_kpi_mediciones FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_kpi_med_delete" ON bos_kpi_mediciones FOR DELETE USING (is_boss_admin(fabrica_id));

-- OBJETIVOS
CREATE POLICY "boss_obj_select" ON bos_objetivos FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_obj_insert" ON bos_objetivos FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_obj_update" ON bos_objetivos FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_obj_delete" ON bos_objetivos FOR DELETE USING (is_boss_admin(fabrica_id));

-- KEY RESULTS
CREATE POLICY "boss_kr_select" ON bos_key_results FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_kr_insert" ON bos_key_results FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_kr_update" ON bos_key_results FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_kr_delete" ON bos_key_results FOR DELETE USING (is_boss_member(fabrica_id));

-- REUNIONES
CREATE POLICY "boss_reu_select" ON bos_reuniones FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_reu_insert" ON bos_reuniones FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_reu_update" ON bos_reuniones FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_reu_delete" ON bos_reuniones FOR DELETE USING (is_boss_admin(fabrica_id));

-- ACUERDOS REUNION
CREATE POLICY "boss_acu_select" ON bos_acuerdos_reunion FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_acu_insert" ON bos_acuerdos_reunion FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_acu_delete" ON bos_acuerdos_reunion FOR DELETE USING (is_boss_member(fabrica_id));

-- DECISIONES
CREATE POLICY "boss_dec_select" ON bos_decisiones FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_dec_insert" ON bos_decisiones FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_dec_update" ON bos_decisiones FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_dec_delete" ON bos_decisiones FOR DELETE USING (is_boss_admin(fabrica_id));

-- VOTOS
CREATE POLICY "boss_voto_select" ON bos_votos_decision FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_voto_insert" ON bos_votos_decision FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_voto_update" ON bos_votos_decision FOR UPDATE USING (votante_id = auth.uid());

-- PROBLEMAS
CREATE POLICY "boss_prob_select" ON bos_problemas FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_prob_insert" ON bos_problemas FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_prob_update" ON bos_problemas FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_prob_delete" ON bos_problemas FOR DELETE USING (is_boss_admin(fabrica_id));

-- IDEAS
CREATE POLICY "boss_idea_select" ON bos_ideas FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_idea_insert" ON bos_ideas FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_idea_update" ON bos_ideas FOR UPDATE USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_idea_delete" ON bos_ideas FOR DELETE USING (is_boss_admin(fabrica_id));

-- BITÁCORA
CREATE POLICY "boss_bit_select" ON bos_bitacora FOR SELECT USING (is_boss_member(fabrica_id));
CREATE POLICY "boss_bit_insert" ON bos_bitacora FOR INSERT WITH CHECK (is_boss_member(fabrica_id));
CREATE POLICY "boss_bit_delete" ON bos_bitacora FOR DELETE USING (is_boss_admin(fabrica_id) AND NOT automatico);

-- NOTIFICACIONES
CREATE POLICY "boss_notif_select" ON bos_notificaciones FOR SELECT USING (destinatario_id = auth.uid());
CREATE POLICY "boss_notif_update" ON bos_notificaciones FOR UPDATE USING (destinatario_id = auth.uid());

-- PROFILES (puede ya existir, usamos DO para no duplicar)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select') THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update') THEN
    CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());
  END IF;
END $$;

-- -----------------------------------------------
-- 15. TRIGGER updated_at PARA bos_tareas
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bos_tareas_updated_at ON bos_tareas;
CREATE TRIGGER bos_tareas_updated_at
  BEFORE UPDATE ON bos_tareas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FIN — Business OS SQL Setup
-- ============================================================
