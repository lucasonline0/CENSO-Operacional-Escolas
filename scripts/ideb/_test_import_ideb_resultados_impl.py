# -*- coding: utf-8 -*-
"""Testes unitários do importador IDEB (scripts/ideb/import_ideb_resultados.py).

Cobre os critérios de aceite da task "Suporte IDEB 2025":
  1. conversão de '-'/ND/vazio -> NULL (nunca 0);
  2. codigo_inep preservado como texto (zeros à esquerda, sem ".0" do Excel);
  3. chave composta (ano, codigo_inep, etapa) e detecção de duplicidades;
  4. vínculo com schools (match / sem match / pendente) e alerta de nome;
  5. contrato do UPSERT: ON CONFLICT na chave composta, sem DELETE/TRUNCATE,
     incluindo a coluna presentes e sem mexer em created_at;
  6. configuração multi-ano (2023 vs 2025), incluindo o mapeamento novo.

Existe também um teste de idempotência em banco real (UPSERT executado duas
vezes no mesmo alvo) que PULA automaticamente quando TEST_DATABASE_URL não
está definida (mesmo padrão dos testes Go do projeto).

Execução:
    python -m unittest discover -s scripts/ideb -p "test_*.py"
    TEST_DATABASE_URL=... python -m unittest scripts.ideb.test_import_ideb_resultados -v
"""

import os
import sys
import time
import unittest

# Garante a importação do módulo mesmo fora de `discover -s scripts/ideb`.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

import import_ideb_resultados as imp  # noqa: E402

try:
    import psycopg  # noqa: F401

    _HAS_PSYCOPG = True
except ImportError:  # pragma: no cover - só existe para o teste de banco
    _HAS_PSYCOPG = False

parse_num = imp.parse_num
is_ausente = imp.is_ausente
texto_limpo = imp.texto_limpo
normalizar_inep = imp.normalizar_inep
normalizar_etapa = imp.normalizar_etapa
classificar_status = imp.classificar_status
calcular_estatisticas = imp.calcular_estatisticas
resolver_vinculo = imp.resolver_vinculo
get_config = imp.get_config
montar_colunas = imp.montar_colunas
montar_campos_indicadores = imp.montar_campos_indicadores
linha_para_params = imp.linha_para_params
UPSERT_SQL = imp.UPSERT_SQL

CAMPOS_INDICADORES = montar_campos_indicadores(get_config(2025))


def linha_stats(ano, inep, etapa, ideb, perc=100.0, detalhe=None):
    """Linha normalizada mínima para calcular_estatisticas/classificar_status."""
    status = "com_ideb" if ideb is not None else "sem_ideb_divulgado"
    return {
        "ano": ano,
        "codigo_inep": inep,
        "etapa": etapa,
        "ideb": ideb,
        "percentual_avaliado": perc,
        "status_ideb": status,
        "detalhe_status_ideb": detalhe,
        "_raw": {
            "proficiencia_portugues": "250.0" if ideb is not None else "-",
            "proficiencia_matematica": "260.0" if ideb is not None else "-",
        },
    }


def linha_raw(ideb, raw_indicadores):
    """Linha no formato esperado por classificar_status (com `_raw` completo)."""
    return {"ideb": ideb, "_raw": raw_indicadores}


# ---------------------------------------------------------------------------
# 1. Ausência ('-', ND, vazio) -> None, nunca 0
# ---------------------------------------------------------------------------
class TestParseNumAbsencia(unittest.TestCase):
    def test_marcadores_de_ausencia_viram_none(self):
        for valor in ["-", "", "ND", "N/D", "NA", "N/A", "none", None]:
            self.assertIsNone(parse_num(valor), f"esperava None para {valor!r}")

    def test_valores_numericos_continuam_float(self):
        self.assertEqual(parse_num("4.5"), 4.5)
        self.assertEqual(parse_num(42), 42.0)
        self.assertEqual(parse_num("2,5"), 2.5)
        self.assertEqual(parse_num("0"), 0.0)

    def test_texto_nao_numerico_vira_none(self):
        self.assertIsNone(parse_num("abc"))
        self.assertIsNone(parse_num("mais de 100"))

    def test_eh_menos_que_trinta(self):
        self.assertTrue(is_ausente("-"))
        self.assertTrue(is_ausente("nd"))
        self.assertFalse(is_ausente(0))


class TestZeroNaoConfundidoComAusencia(unittest.TestCase):
    def test_zero_numerico_e_valor(self):
        self.assertEqual(imp.parse_num("0"), 0.0)
        self.assertEqual(imp.parse_num(0), 0.0)


# ---------------------------------------------------------------------------
# 2. INEP como texto (zeros à esquerda; remoção do ".0" do Excel)
# ---------------------------------------------------------------------------
class TestNormalizarINEP(unittest.TestCase):
    def test_float_sem_sufixo_ponto_zero(self):
        self.assertEqual(normalizar_inep(15000001.0), "15000001")

    def test_texto_com_ponto_zero_e_removido(self):
        self.assertEqual(normalizar_inep("15000001.0"), "15000001")

    def test_texto_numero_intacto(self):
        self.assertEqual(normalizar_inep("15000002"), "15000002")

    def test_zeros_a_esquerda_preservados(self):
        self.assertEqual(normalizar_inep("01000000"), "01000000")
        self.assertEqual(normalizar_inep("00150000"), "00150000")
        self.assertEqual(normalizar_inep(1500001.0), "1500001")

    def test_none_vira_vazio(self):
        self.assertEqual(normalizar_inep(None), "")


# ---------------------------------------------------------------------------
# 3. Etapas: rótulos 2023 e 2025 -> chave canônica
# ---------------------------------------------------------------------------
class TestNormalizarEtapa(unittest.TestCase):
    def test_rotulos_2023(self):
        self.assertEqual(normalizar_etapa("anos iniciais"), "anos_iniciais")
        self.assertEqual(normalizar_etapa("Anos Finais"), "anos_finais")
        self.assertEqual(normalizar_etapa("ensino medio"), "ensino_medio")

    def test_rotulos_2025(self):
        self.assertEqual(
            normalizar_etapa("5º ano do Ensino Fundamental"), "anos_iniciais"
        )
        self.assertEqual(
            normalizar_etapa("9º ano de Ensino Fundamental"), "anos_finais"
        )
        self.assertEqual(
            normalizar_etapa("3ª/4ª série do Ensino Médio"), "ensino_medio"
        )

    def test_variacoes_de_acento_e_caixa(self):
        self.assertEqual(normalizar_etapa(" 5º ANO DO ENSINO FUNDAMENTAL "), "anos_iniciais")
        self.assertEqual(normalizar_etapa("ENSINO MÉDIO"), "ensino_medio")

    def test_etapa_desconhecida(self):
        self.assertEqual(normalizar_etapa("EJA"), "desconhecida")
        self.assertEqual(normalizar_etapa(None), "desconhecida")


# ---------------------------------------------------------------------------
# 4. classificar_status (guarda-chuva + detalhe técnico)
# ---------------------------------------------------------------------------
class TestClassificarStatus(unittest.TestCase):
    def test_com_ideb(self):
        raw = {
            "total_avaliado": "100", "percentual_avaliado": "90.5",
            "proficiencia_portugues": "250", "proficiencia_matematica": "260",
            "fluxo_indicador_rendimento": "0.9", "ideb": "4.5",
        }
        self.assertEqual(
            classificar_status(linha_raw(4.5, raw), CAMPOS_INDICADORES),
            ("com_ideb", None),
        )

    def test_todos_indicadores_ausentes_sem_resultado(self):
        raw = {c: "-" for c in CAMPOS_INDICADORES}
        self.assertEqual(
            classificar_status(linha_raw(None, raw), CAMPOS_INDICADORES),
            ("sem_ideb_divulgado", "sem_resultado"),
        )

    def test_nd_em_proficiencia(self):
        raw = {
            "total_avaliado": "100", "percentual_avaliado": "80",
            "proficiencia_portugues": "ND", "proficiencia_matematica": "-",
            "fluxo_indicador_rendimento": "-", "ideb": "-",
        }
        self.assertEqual(
            classificar_status(linha_raw(None, raw), CAMPOS_INDICADORES),
            ("sem_ideb_divulgado", "nd_proficiencia"),
        )

    def test_outro_quando_parcial(self):
        raw = {
            "total_avaliado": "100", "percentual_avaliado": None,
            "proficiencia_portugues": None, "proficiencia_matematica": None,
            "fluxo_indicador_rendimento": None, "ideb": "-",
        }
        self.assertEqual(
            classificar_status(linha_raw(None, raw), CAMPOS_INDICADORES),
            ("sem_ideb_divulgado", "outro"),
        )


# ---------------------------------------------------------------------------
# 5. Estatísticas: chave composta e duplicidade
# ---------------------------------------------------------------------------
class TestEstatisticasDuplicidade(unittest.TestCase):
    def test_duplicidade_na_chave_composta(self):
        linhas = [
            linha_stats(2025, "15000001", "anos_iniciais", 5.5),
            linha_stats(2025, "15000001", "anos_iniciais", 5.5),
            linha_stats(2025, "15000002", "anos_iniciais", 6.0),
        ]
        s = calcular_estatisticas(linhas)
        self.assertEqual(s["total_registros"], 3)
        self.assertEqual(s["ineps_unicos"], 2)
        self.assertEqual(s["com_ideb"], 3)
        self.assertEqual(s["sem_ideb"], 0)
        self.assertEqual(len(s["duplicidades"]), 1)
        self.assertEqual(
            s["duplicidades"][(2025, "15000001", "anos_iniciais")], 2
        )

    def test_mesmo_inep_etapa_diferente_nao_duplica(self):
        linhas = [
            linha_stats(2025, "15000001", "anos_iniciais", 5.5),
            linha_stats(2025, "15000001", "anos_finais", 4.8),
        ]
        s = calcular_estatisticas(linhas)
        self.assertEqual(len(s["duplicidades"]), 0)

    def test_mesmo_inep_ano_diferente_nao_duplica(self):
        linhas = [
            linha_stats(2023, "15000001", "anos_iniciais", 5.5),
            linha_stats(2025, "15000001", "anos_iniciais", 5.9),
        ]
        s = calcular_estatisticas(linhas)
        self.assertEqual(len(s["duplicidades"]), 0)

    def test_sem_ideb_e_contado(self):
        linhas = [
            linha_stats(2025, "15000001", "anos_iniciais", None),
            linha_stats(2025, "15000001", "anos_iniciais", None),
        ]
        s = calcular_estatisticas(linhas)
        self.assertEqual(s["sem_ideb"], 2)


# ---------------------------------------------------------------------------
# 6. Vínculo com schools (match / sem match / pendente + alerta de nome)
# ---------------------------------------------------------------------------
class TestResolverVinculo(unittest.TestCase):
    def test_match_inep(self):
        linhas = [{"codigo_inep": "15000001", "nome_escola_origem": "ESCOLA A"}]
        alertas = resolver_vinculo(
            linhas, {"15000001": {"id": 7, "nome_escola": "ESCOLA A"}}, True
        )
        self.assertEqual(linhas[0]["school_id"], 7)
        self.assertEqual(linhas[0]["status_vinculo"], "match_inep")
        self.assertEqual(alertas, [])

    def test_sem_match_inep(self):
        linhas = [{"codigo_inep": "99999999", "nome_escola_origem": "ESCOLA X"}]
        resolver_vinculo(linhas, {}, True)
        self.assertIsNone(linhas[0]["school_id"])
        self.assertEqual(linhas[0]["status_vinculo"], "sem_match_inep")

    def test_pendente_sem_conexao(self):
        linhas = [{"codigo_inep": "15000001", "nome_escola_origem": "ESCOLA A"}]
        resolver_vinculo(linhas, {}, False)
        self.assertIsNone(linhas[0]["school_id"])
        self.assertEqual(linhas[0]["status_vinculo"], "pendente_validacao")

    def test_divergencia_de_nome_vira_alerta(self):
        linhas = [{"codigo_inep": "15000001", "nome_escola_origem": "ESCOLA NOVO NOME"}]
        alertas = resolver_vinculo(
            linhas, {"15000001": {"id": 7, "nome_escola": "ESCOLA NOME ANTIGO"}}, True
        )
        self.assertEqual(len(alertas), 1)
        self.assertEqual(alertas[0]["codigo_inep"], "15000001")


# ---------------------------------------------------------------------------
# 7. Contrato do UPSERT (idempotência estrutural)
# ---------------------------------------------------------------------------
class TestUPSERTContrato(unittest.TestCase):
    def test_on_conflict_na_chave_composta(self):
        self.assertIn("ON CONFLICT (ano, codigo_inep, etapa) DO UPDATE", UPSERT_SQL)

    def test_contem_coluna_presentes(self):
        self.assertIn("presentes", UPSERT_SQL.lower())

    def test_sem_operacoes_destrutivas(self):
        for kw in ("DELETE", "TRUNCATE", "DROP TABLE"):
            self.assertNotIn(kw, UPSERT_SQL.upper())

    def test_nao_altera_created_at_em_update(self):
        self.assertNotIn("created_at = EXCLUDED.created_at", UPSERT_SQL)


# ---------------------------------------------------------------------------
# 8. Configuração multi-ano (2023 vs 2025)
# ---------------------------------------------------------------------------
class TestConfig2025(unittest.TestCase):
    def setUp(self):
        self.config = get_config(2025)
        self.colunas = montar_colunas(self.config)

    def test_aba_e_coluna_ideb(self):
        self.assertEqual(self.config["aba"], "IDEB 2025")
        self.assertEqual(self.colunas["ideb"], "IDEB 2025")

    def test_mapeamento_das_colunas_2025(self):
        self.assertEqual(
            self.colunas["total_avaliado"], "QT. DE ALUNOS MATRICULADOS CENSO"
        )
        self.assertEqual(self.colunas["percentual_avaliado"], "TAXA DE PARTICIPACAO")
        self.assertEqual(self.colunas["presentes"], "PRESENTES")

    def test_colunas_base_compactadas(self):
        self.assertEqual(self.colunas["inep"], "INEP")
        self.assertEqual(self.colunas["fluxo_indicador_rendimento"], "Fluxo - Indicador de rendimento")

    def test_2023_sem_coluna_presentes(self):
        colunas_2023 = montar_colunas(get_config(2023))
        self.assertNotIn("presentes", colunas_2023)
        self.assertEqual(colunas_2023["total_avaliado"], "Total avaliado")
        self.assertEqual(colunas_2023["percentual_avaliado"], "Percentual avaliado")

    def test_campos_indicadores_estaveis(self):
        self.assertEqual(
            CAMPOS_INDICADORES,
            [
                "total_avaliado",
                "percentual_avaliado",
                "proficiencia_portugues",
                "proficiencia_matematica",
                "fluxo_indicador_rendimento",
                "ideb",
            ],
        )


# ---------------------------------------------------------------------------
# 9. Idempotência em banco real (pula sem TEST_DATABASE_URL / psycopg)
# ---------------------------------------------------------------------------
@unittest.skipUnless(
    _HAS_PSYCOPG and os.environ.get("TEST_DATABASE_URL"),
    "requer psycopg instalado e TEST_DATABASE_URL configurada",
)
class TestIdempotenciaBanco(unittest.TestCase):
    """Executa o UPSERT_SQL real duas vezes e garante que não duplica linhas."""

    DDL = """
        CREATE TABLE schools (
            id SERIAL PRIMARY KEY,
            codigo_inep VARCHAR(20)
        );
        CREATE TABLE ideb_resultados (
            id SERIAL PRIMARY KEY,
            ano INT NOT NULL,
            codigo_inep VARCHAR(20) NOT NULL,
            school_id INT NULL,
            nome_escola_origem VARCHAR(255) NOT NULL,
            etapa VARCHAR(30) NOT NULL,
            total_avaliado NUMERIC(12,2) NULL,
            percentual_avaliado NUMERIC(8,2) NULL,
            proficiencia_portugues NUMERIC(8,2) NULL,
            proficiencia_matematica NUMERIC(8,2) NULL,
            fluxo_indicador_rendimento NUMERIC(6,4) NULL,
            ideb NUMERIC(4,2) NULL,
            presentes INT NULL,
            status_ideb VARCHAR(30) NOT NULL,
            detalhe_status_ideb VARCHAR(30) NULL,
            status_vinculo VARCHAR(30) NOT NULL,
            fonte_arquivo VARCHAR(255) NULL,
            fonte_inep_url TEXT NULL,
            import_batch_id VARCHAR(80) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT ideb_resultados_ano_inep_etapa_uniq
                UNIQUE (ano, codigo_inep, etapa)
        );
    """

    def setUp(self):
        self.dsn = os.environ["TEST_DATABASE_URL"]
        self.conn = psycopg.connect(self.dsn, connect_timeout=10)
        self.schema = f"ideb_test_{time.time_ns()}"
        with self.conn.cursor() as cur:
            cur.execute(
                psycopg.sql.SQL("CREATE SCHEMA {}")
                .format(psycopg.sql.Identifier(self.schema))
            )
            cur.execute(
                psycopg.sql.SQL("SET search_path TO {}")
                .format(psycopg.sql.Identifier(self.schema))
            )
            cur.execute(self.DDL)
        self.conn.commit()

    def tearDown(self):
        with self.conn.cursor() as cur:
            cur.execute(
                psycopg.sql.SQL("DROP SCHEMA {} CASCADE")
                .format(psycopg.sql.Identifier(self.schema))
            )
        self.conn.commit()
        self.conn.close()

    def _upsert(self, linha, ctx):
        with self.conn.cursor() as cur:
            cur.execute(UPSERT_SQL, linha_para_params(linha, ctx))
        self.conn.commit()

    def _count(self):
        with self.conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM ideb_resultados")
            return cur.fetchone()[0]

    def _linhas(self):
        base2025 = {
            "ano": 2025,
            "codigo_inep": "15000001",
            "school_id": None,
            "nome_escola_origem": "ESCOLA A",
            "etapa": "anos_iniciais",
            "total_avaliado": 100.0,
            "percentual_avaliado": 95.5,
            "proficiencia_portugues": 240.0,
            "proficiencia_matematica": 245.0,
            "fluxo_indicador_rendimento": 0.9,
            "ideb": 5.5,
            "presentes": 90.0,
            "status_ideb": "com_ideb",
            "detalhe_status_ideb": None,
            "status_vinculo": "sem_match_inep",
        }
        linha2025 = dict(base2025)
        linha2023 = dict(base2025, ano=2023, presentes=None)
        ctx = {
            "fonte_arquivo": "ideb_2025_iniciais_finais_medio.xlsx",
            "fonte_inep_url": "https://download.inep.gov.br/ideb/nota_informativa_ideb_2025.pdf",
            "batch_id": "ideb_2025_test",
        }
        return linha2025, linha2023, ctx

    def test_carga_2025_duas_vezes_sem_duplicar(self):
        linha2025, linha2023, ctx = self._linhas()

        self._upsert(linha2025, ctx)
        self.assertEqual(self._count(), 1, "primeira carga deve inserir 1 linha")

        self._upsert(linha2025, ctx)
        self.assertEqual(
            self._count(), 1,
            "segunda carga da MESMA chave deve atualizar, não inserir",
        )

    def test_carga_2025_nao_toca_em_2023(self):
        linha2025, linha2023, ctx = self._linhas()

        self._upsert(linha2023, ctx)
        self._upsert(linha2025, ctx)

        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT ano, COUNT(*) FROM ideb_resultados GROUP BY ano ORDER BY ano"
            )
            self.assertEqual(cur.fetchall(), [(2023, 1), (2025, 1)])
            cur.execute("SELECT presentes FROM ideb_resultados WHERE ano = 2025")
            self.assertEqual(cur.fetchone()[0], 90)
            cur.execute("SELECT ideb FROM ideb_resultados WHERE ano = 2023")
            self.assertEqual(cur.fetchone()[0], 5.5)


if __name__ == "__main__":
    unittest.main()