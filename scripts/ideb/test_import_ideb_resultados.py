# -*- coding: utf-8 -*-
"""Suite pública do importador IDEB com regressões específicas de 2025."""

import unittest

import import_ideb_resultados as imp
from _test_import_ideb_resultados_impl import *  # noqa: F401,F403
from _test_import_ideb_resultados_impl import TestConfig2025


def _test_mapeamento_das_colunas_2025(self):
    self.assertEqual(self.colunas["total_avaliado"], "PRESENTES")
    self.assertEqual(self.colunas["percentual_avaliado"], "TAXA DE PARTICIPACAO")
    self.assertEqual(self.colunas["presentes"], "PRESENTES")
    self.assertEqual(
        self.colunas["matriculados_censo"],
        "QT. DE ALUNOS MATRICULADOS CENSO",
    )


# Substitui a expectativa antiga que tratava matrículas do Censo como se fossem
# alunos avaliados. Mantemos o restante da suíte histórica sem duplicação.
TestConfig2025.test_mapeamento_das_colunas_2025 = _test_mapeamento_das_colunas_2025


class TestSemanticaParticipacao2025(unittest.TestCase):
    def test_total_avaliado_aponta_para_presentes(self):
        colunas = imp.montar_colunas(imp.get_config(2025))
        self.assertEqual(colunas["total_avaliado"], "PRESENTES")
        self.assertNotEqual(
            colunas["total_avaliado"],
            "QT. DE ALUNOS MATRICULADOS CENSO",
        )

    def test_2023_mantem_mapeamento_original(self):
        colunas = imp.montar_colunas(imp.get_config(2023))
        self.assertEqual(colunas["total_avaliado"], "Total avaliado")
        self.assertNotIn("matriculados_censo", colunas)


if __name__ == "__main__":
    unittest.main()
