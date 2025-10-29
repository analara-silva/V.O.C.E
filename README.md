# V.O.C.E - Visualização e Observação do Comportamento Estudantil

![Versão](https://img.shields.io/badge/version-4.1-blue)
![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)

---

**👤 Autores:** Ana Lara, Gustavo, Sidney  
**🎓 Orientadores:** Leonardo Gomes, Anderson Roberto  
**🏫 Instituição:** SENAI-SP  
**📘 Projeto:** Trabalho de Conclusão de Curso (TCC) – Curso Técnico em Desenvolvimento de Sistemas

---

O **V.O.C.E** é uma plataforma completa desenvolvida como parte do **Trabalho de Conclusão de Curso (TCC)** do SENAI-SP. Seu objetivo é possibilitar o **monitoramento das atividades de navegação de alunos em ambientes escolares**, permitindo que professores acompanhem o tempo de uso de sites, categorizem os acessos com **inteligência artificial** e visualizem tudo através de um **dashboard interativo** para análise e gestão pedagógica.

---

## Funcionalidades Principais

- **Monitoramento Multi-navegador**: Extensões para Google Chrome e Firefox.
- **Identificação de Alunos**: Identificação flexível através do nome de usuário do sistema operacional, CPF ou ID do computador.
- **Classificação com IA**: URLs são automaticamente categorizadas em grupos como "Educacional", "Rede Social", "Jogos", etc., utilizando técnicas de processamento de linguagem natural como GloVe.
- **Dashboard do Professor**: Interface web para gestão de turmas, alunos e visualização de dados de navegação.
- **Segurança e Privacidade**: Autenticação de professores, senhas criptografadas e isolamento de dados por turma.
- **Armazenamento Escalável**: Utiliza o Google Firebase (Firestore) como banco de dados, garantindo performance e escalabilidade.
- **Arquitetura Resiliente**: Sistema de fallback que utiliza um classificador simples caso a IA principal falhe.

---

## Estrutura do Projeto


```
. V.O.C.E-main/
├── monitor-backend/      # Servidor Node.js, IA e Dashboard
├── monitor-extensao/     # Extensão para o Chrome e Firefox
. native_host/      # Script para comunicação com o SO (native_host.py)
. host_manifest/        # Contém os manifestos do host nativo para Chrome e Firefox (host_manifest-chrome.json, host_manifest-firefox.json)
```

---

