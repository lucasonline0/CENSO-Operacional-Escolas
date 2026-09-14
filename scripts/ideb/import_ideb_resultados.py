# -*- coding: utf-8 -*-
"""Entry point estável do importador IDEB.

A implementação histórica fica em ``_import_ideb_resultados_impl``. Este módulo
mantém o contrato público do script e aplica a adaptação semântica da fonte 2025:
``PRESENTES`` representa a quantidade efetivamente avaliada, enquanto
``QT. DE ALUNOS MATRICULADOS CENSO`` é o denominador da taxa de participação.
"""

import _import_ideb_resultados_impl as _impl
from _import_ideb_resultados_impl import *  # noqa: F401,F403

_original_get_config = _impl.get_config


def get_config(ano):
    """Retorna a configuração da fonte preservando a semântica canônica."""
    config = _original_get_config(ano)
    if ano == 2025:
        # No Saeb/IDEB 2025, matriculados no Censo são o denominador da taxa de
        # participação. A quantidade que corresponde a alunos avaliados é
        # PRESENTES; portanto ela deve alimentar o campo canônico
        # ``total_avaliado`` usado nas agregações ponderadas do dashboard.
        config["colunas_anuais"]["total_avaliado"] = "PRESENTES"
        config["colunas_extras"] = {
            **config.get("colunas_extras", {}),
            "presentes": "PRESENTES",
            # Mantém a coluna de matrículas como insumo validado/auditável sem
            # confundi-la com total_avaliado. O modelo atual não a persiste.
            "matriculados_censo": "QT. DE ALUNOS MATRICULADOS CENSO",
        }
    return config


# As funções definidas no módulo de implementação resolvem seus globals no
# próprio módulo; substituímos o configurador lá também para que ``main()`` e
# chamadas indiretas usem a mesma regra.
_impl.get_config = get_config


if __name__ == "__main__":
    raise SystemExit(_impl.main())
