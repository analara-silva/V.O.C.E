# V.O.C.E - Vigilância Online de Comportamento Escolar

![Versão](https://img.shields.io/badge/version-2.0-blue)
![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![Licença](https://img.shields.io/badge/license-MIT-green)

O **V.O.C.E** é uma plataforma completa para monitoramento de atividades de navegação em ambiente escolar. O sistema permite que professores acompanhem o tempo de uso de sites pelos alunos, classificando as atividades com inteligência artificial e fornecendo um dashboard para análise e gestão.

---

## Funcionalidades Principais

- **Monitoramento Multi-navegador**: Extensões para Google Chrome e Firefox (em desenvolvimento).
- **Identificação de Alunos**: Identificação flexível através do nome de usuário do sistema operacional, CPF ou ID do computador.
- **Classificação com IA**: URLs são automaticamente categorizadas em grupos como "Educacional", "Rede Social", "Jogos", etc.
- **Dashboard do Professor**: Interface web para gestão de turmas, alunos e visualização de dados de navegação.
- **Segurança e Privacidade**: Autenticação de professores, senhas criptografadas e isolamento de dados por turma.
- **Armazenamento Escalável**: Utiliza o Google Firebase (Firestore) como banco de dados, garantindo performance e escalabilidade.
- **Arquitetura Resiliente**: Sistema de fallback que utiliza um classificador simples caso a IA principal falhe.

---

## Arquitetura do Sistema

O sistema é composto por três componentes principais que se comunicam de forma integrada:

1.  **Extensão do Navegador**: Captura os dados de navegação.
2.  **Native Host**: Fornece o nome de usuário do SO para a extensão.
3.  **Backend (Servidor Node.js)**: Recebe, processa, classifica e armazena os dados, além de servir o dashboard do professor.

```mermaid
graph TD
    subgraph Aluno
        A[Navegador com Extensão V.O.C.E] -->|Coleta URL e tempo| B(Buffer de Dados)
        A -->|Solicita ID| C{Native Host}
        C -->|Retorna Username do SO| A
    end

    subgraph Servidor
        D[Backend Node.js] <-->|Salva e Consulta| E((Firebase/Firestore))
        D -->|Chama script Python| F{IA de Classificação}
        F -->|Retorna Categoria| D
        G[Dashboard do Professor] <-->|Acessa via Browser| D
    end

    B -->|Envia dados (POST /api/data)| D
```

---

## Tecnologias Utilizadas

| Componente          | Tecnologia/Framework                                     |
| ------------------- | -------------------------------------------------------- |
| **Backend**         | Node.js, Express.js, EJS                                 |
| **Banco de Dados**  | Google Firestore (Firebase)                              |
| **Inteligência IA** | Python, Scikit-learn (Logistic Regression), TF-IDF       |
| **Extensão**        | JavaScript (Manifest V4)                                 |
| **Autenticação**    | bcrypt.js, express-session                               |
| **Comunicação**     | Native Messaging (Extensão <-> Host)                     |

---

## Instalação e Configuração

Siga os passos abaixo para configurar o ambiente de desenvolvimento completo.

### 1. Pré-requisitos

- [Node.js](https://nodejs.org/) (v18 ou superior)
- [Python](https://www.python.org/) (v3.9 ou superior)
- [Google Chrome](https://www.google.com/chrome/)
- Conta no [Firebase](https://firebase.google.com/)

### 2. Configuração do Backend

1.  **Navegue até a pasta do backend**:
    ```bash
    cd "V.O.C.E-chrome/monitor-backend"
    ```

2.  **Instale as dependências do Node.js**:
    ```bash
    npm install
    ```

3.  **Instale as dependências do Python**:
    ```bash
    pip install -r requirements.txt
    # (Crie um requirements.txt com scikit-learn, pandas)
    ```

4.  **Configure as Variáveis de Ambiente**:
    - Crie um arquivo `.env` na raiz da pasta `monitor-backend`.
    - Adicione as seguintes variáveis:

    ```env
    # Porta do servidor
    PORT=3000

    # Chave secreta para a sessão
    SESSION_SECRET=seu-segredo-super-secreto-aqui

    # Credenciais do Firebase (obtidas no console do Firebase)
    FIREBASE_PROJECT_ID=seu-projeto-id
    FIREBASE_CLIENT_EMAIL=seu-email@seu-projeto-id.iam.gserviceaccount.com
    FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA\n-----END PRIVATE KEY-----\n"
    ```

5.  **Inicie o servidor**:
    ```bash
    npm start
    ```
    O servidor estará rodando em `http://localhost:3000`.

### 3. Instalação do Native Host (Windows)

O Native Host é necessário para que a extensão possa identificar o usuário do computador.

1.  **Edite o arquivo `host_manifest.json`** na pasta `tcc_native_host` e certifique-se de que o caminho (`path`) para `native_host.py` está correto.
2.  **Execute o `install.bat` como administrador**. Isso irá registrar o host nativo no Windows.

### 4. Instalação da Extensão no Chrome

1.  Abra o Google Chrome e navegue até `chrome://extensions`.
2.  Ative o **"Modo do desenvolvedor"** no canto superior direito.
3.  Clique em **"Carregar sem compactação"**.
4.  Selecione a pasta `V.O.C.E-chrome/monitor-extensao`.

---

## Estrutura do Projeto

```
. V.O.C.E-main v.2.0/
├── V.O.C.E-chrome/
│   ├── monitor-backend/      # Servidor Node.js, IA e Dashboard
│   └── monitor-extensao/     # Extensão para o Chrome
├── V.O.C.E-firefox/          # (Em desenvolvimento)
└── tcc_native_host/          # Script para comunicação com o SO
```

---

## Problemas Conhecidos e Melhorias

- **Acurácia da IA**: O modelo de classificação possui uma acurácia baixa (~35%) devido a um dataset de treinamento pequeno e com ruído. É a principal área para melhoria.
- **Extensão Firefox**: A implementação da extensão para Firefox ainda não foi concluída.

## Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).

