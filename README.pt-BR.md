# qa-risk-queue

[English](README.md) · **Português**

> Toda manhã: *o que eu testo hoje?*

Quando a IA escreve a maior parte do código, uma esteira pode ir de **19 para 803 PRs mergeados por mês**, com o approval virando exceção. Ninguém testa 800 PRs na mão, e testar primeiro o que mergeou por último é loteria.

O `qa-risk-queue` lê o que mergeou numa janela de tempo no GitHub e ordena **pelo que ainda precisa de olho humano**: config de produção, autorização, migração de dado, contrato de API, card entregue em fatias. Cada item vem com *o que olhar*, não só uma nota.

Uma semana do `supabase/supabase`: 224 PRs viraram **15 itens que valem o tempo do QA**, e 78 foram descartados por serem doc, estilo ou teste. Saída completa em [examples/supabase-week-2026-10-22.md](examples/supabase-week-2026-10-22.md).

## Como rodar

Precisa de Node 20+ e do [GitHub CLI](https://cli.github.com/) logado (`gh auth login`). Não tem dependência de npm.

```bash
node src/cli.mjs --repo supabase/supabase --config examples/supabase.json --since 1d
node src/cli.mjs --org minha-empresa --since 7d --top 12
npm test
```

## Como a nota funciona

A **natureza da mudança** dá a base: produção 4, autorização 4, breaking/migração/contrato 3, config 2, produto 2, resto 1. Os sinais de processo (sem approval, sem teste, PR grande, card fatiado, fix que voltou) só **agravam**, +1 cada, com **teto de +3**. Os PRs são agrupados por **card** (`ABC-123` na branch ou no título), porque a unidade de trabalho do QA é o card, não o PR.

## Decisões que vieram de erro real

Cada regra existe porque a primeira versão errou em dado real. Os testes em [`test/risk.test.mjs`](test/risk.test.mjs) travam cada uma delas.

- **Teto de +3 nos agravantes.** Sem ele, um card de UI fatiado em 16 PRs passava na frente de uma mudança de config de produção.
- **Sem approval e sem teste não são base.** Numa esteira onde isso é o normal, como base esses sinais jogam tudo para cima.
- **Arquivo de teste e de doc não acende sinal de base.** O `tool_names_guard_test.go` casou "guard". No Supabase, um PR só de `.mdx` em `guides/auth/` apareceu como mudança de autorização.
- **Authz casa por segmento de caminho.** `regulations/gates/` não é controle de acesso.
- **`token` é sinal fraco.** O `form-token.ts` de uma landing page é anti-spam e virou o item #1 da semana.
- **Auth em superfície não crítica é fraco, e cada repo calibra.** No Supabase, *Auth* é o nome de uma tela do dashboard, e o `authzIgnore` tira esses caminhos.
- **A coleta falha alto.** A busca do GitHub para em 1.000 resultados, então janela truncada gera aviso. Silêncio faria a fila mentir por omissão.

## Limites

- A nota sai de metadado (caminho, tamanho, review, teste). Do diff, só lê os nomes de chave de config.
- Não sabe o que já foi testado: use junto com o board.
- A calibragem é por base de código. Conte com a primeira semana ajustando `repos` e `authzIgnore`.
