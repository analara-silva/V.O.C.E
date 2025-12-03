# V.O.C.E - Visualização e Observação do Comportamento Estudantil

![Versão](https://img.shields.io/badge/version-1.1-blue)
![Status](https://img.shields.io/badge/status-desenvolvimento-green)
![Licença](https://img.shields.io/badge/license-ISC-blue)

---

## 👥 Autores e Orientação

**Autores:** Ana Lara Fernandes, Gustavo Emanuel Alves, Sidney da Silva Paulino  
**Orientadores:** Leonardo Gomes e Anderson Roberto  
**Instituição:** SENAI-SP 

---

O **V.O.C.E** é uma plataforma completa desenvolvida para o monitoramento e análise do comportamento de navegação de alunos em ambientes educacionais. O sistema permite que professores acompanhem o tempo de uso de sites, categorizem os acessos com **Inteligência Artificial** e visualizem os dados em um **Dashboard Interativo** para análise pedagógica.

## 🚀 Destaques e Inovações Técnicas

O projeto V.O.C.E. é construído sobre uma arquitetura **Full-Stack Híbrida** que combina o melhor de diferentes ecossistemas para garantir performance, inteligência e confiabilidade.

### 1. Classificação Inteligente de URLs (Deep Learning)

- **Tecnologia Central:** Utilizamos **TensorFlow** e **Keras** para implementar um modelo de **CNN (Convolutional Neural Network) Híbrida**.
- **Inovação:** O modelo analisa a URL em dois níveis (por palavras e por caracteres) para uma categorização precisa em tempo real (e.g., "Educacional", "Rede Social", "Jogos").
- **Recursos:** O sistema inclui um **Sistema de Fallback** robusto, garantindo que a categorização continue funcionando mesmo em caso de falha do modelo principal.

### 2. Arquitetura de Comunicação Avançada

- **Tempo Real:** O Dashboard do professor é atualizado instantaneamente via **Socket.IO** (WebSockets), permitindo que os educadores visualizem os logs de navegação no momento em que ocorrem.
- **Integração Nativa:** A Extensão do Navegador se comunica com o Sistema Operacional através do protocolo **Native Messaging** (implementado em Python), garantindo a **identificação segura e confiável** do aluno.
- **Otimização:** A Extensão utiliza **Batch Processing** para enviar logs em lotes, otimizando o uso da rede e reduzindo a carga no servidor.

### 3. Stack Tecnológica

| Camada | Tecnologias Principais |
|---|---|
| **Backend** | **Node.js**, **Express.js**, **Socket.IO** |
| **Inteligência Artificial** | **Python**, **TensorFlow**, **Keras**, **scikit-learn** |
| **Banco de Dados** | **MySQL/MariaDB** |
| **Frontend** | **Tailwind CSS**, **EJS** (Server-Side Rendering) |
| **Extensão** | **Manifest V3**, **Native Messaging** |

---

## 🔒 Conformidade e Proteção de Dados

O projeto V.O.C.E. foi desenvolvido com foco rigoroso na segurança e na privacidade dos dados, em conformidade com as melhores práticas de proteção de dados (como a LGPD no Brasil).

### 1. Segurança na Identificação

- **Anonimização:** O sistema rastreia o **ID de identificação** do aluno (obtido via Native Host) e não o nome completo, a menos que o professor o vincule no Dashboard.
- **Hash de Senhas:** Todas as senhas de professores são armazenadas usando **bcrypt**, um algoritmo de hash criptográfico robusto e lento, que impede a recuperação de senhas em caso de vazamento de dados.

### 2. Integridade e Prevenção de Ataques

- **SQL Parametrizado:** Todas as interações com o banco de dados utilizam **SQL Parametrizado** (Prepared Statements), prevenindo ataques de **SQL Injection**.
- **Isolamento de Dados:** A lógica de aplicação garante que cada professor acesse apenas os dados de suas turmas, mantendo o isolamento de dados (`Multi-tenant`).

### 3. Uso de Recursos de Terceiros

O módulo de IA utiliza recursos de processamento de linguagem natural. Um dos recursos de apoio para o treinamento do modelo é o arquivo `globe6b100.txt`, que contém vetores de palavras pré-treinados.

- **Referência:** O arquivo `globe6b100.txt` é um recurso público e amplamente utilizado na comunidade de Machine Learning para a criação de embeddings de palavras. **[Clique aqui para baixar.](https://nlp.stanford.edu/projects/glove/)**

---

## 🛠️ Instalação e Configuração

### Pré-requisitos

- Node.js (versão 18+)
- Python (versão 3.8+)
- MySQL/MariaDB
- npm e pip

### 1. Configuração do Backend (Node.js)

```bash
cd V.O.C.E-main/monitor-backend

# Instalar dependências Node.js
npm install

# Instalar dependências Python (para o módulo de IA)
pip3 install -r requirements.txt

# Configurar o arquivo .env (copie o .env.example)
# Preencha as credenciais do MySQL
```

### 2. Configuração do Banco de Dados

1. Crie o banco de dados `v_o_c_e`.
2. Importe o schema:
   ```bash
   mysql -u [seu_usuario] -p v_o_c_e < ../../database_voce.sql
   ```

### 3. Configuração do Native Host (Python)

Siga as instruções nos diretórios `host_manifest` e `native_host` para instalar o host nativo no sistema operacional e permitir a comunicação com a Extensão.

### 4. Execução

```bash
# Iniciar o servidor (com nodemon)
npm start
```

---


