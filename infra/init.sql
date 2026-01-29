-- Tabela de Escolas (Identificação e Dados Fixos)
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    nome_escola VARCHAR(255),
    codigo_inep VARCHAR(20) UNIQUE,
    municipio VARCHAR(100),
    dre VARCHAR(100),
    zona VARCHAR(50),
    endereco TEXT,
    
    -- Campos de Contato e Direção
    cnpj VARCHAR(30),
    telefone VARCHAR(50),
    email VARCHAR(150),
    cep VARCHAR(20),
    nome_diretor VARCHAR(150),
    matricula_diretor VARCHAR(50),
    contato_diretor VARCHAR(50),
    
    -- Campos JSON Armazenados como Texto (Arrays)
    turnos TEXT,
    etapas_ofertadas TEXT,
    modalidades_ofertadas TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Respostas do Censo (Dados Variáveis)
CREATE TABLE IF NOT EXISTS census_responses (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL,
    year INT NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    data JSONB, -- Onde ficam todas as respostas do formulário
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_school
      FOREIGN KEY(school_id) 
      REFERENCES schools(id)
      ON DELETE CASCADE,
      
    CONSTRAINT unique_school_year 
      UNIQUE (school_id, year)
);